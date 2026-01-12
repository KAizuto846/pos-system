const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const { initDatabase, getDB } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar base de datos
initDatabase();
const db = getDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'pos-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ==================== AUTENTICACIÓN ====================

// Verificar si existe administrador
app.get('/api/check-admin', (req, res) => {
  try {
    const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    res.json({ adminExists: !!admin });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar administrador' });
  }
});

// Crear primer administrador
app.post('/api/create-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    if (existingAdmin) {
      return res.status(400).json({ error: 'Ya existe un administrador' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const insert = db.prepare(
      'INSERT INTO users (username, password, role, active, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const result = insert.run(username, hashedPassword, 'admin', 1, new Date().toISOString());
    
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'admin';
    
    res.json({ success: true, message: 'Administrador creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    
    res.json({ 
      success: true, 
      message: 'Login exitoso',
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Verificar sesión
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      authenticated: true,
      user: {
        username: req.session.username,
        role: req.session.role
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ==================== ESTADÍSTICAS ====================

app.get('/api/stats', (req, res) => {
  try {
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const products = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    
    const today = new Date().toISOString().split('T')[0];
    const sales = db.prepare(
      'SELECT COUNT(*) as count FROM sales WHERE DATE(created_at) = ?'
    ).get(today).count;
    
    const revenue = db.prepare(
      'SELECT COALESCE(SUM(total), 0) as sum FROM sales WHERE DATE(created_at) = ?'
    ).get(today).sum;
    
    res.json({ users, products, sales, revenue });
  } catch (error) {
    console.error(error);
    res.json({ users: 0, products: 0, sales: 0, revenue: 0 });
  }
});

// ==================== USUARIOS ====================

app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare(
      'SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC'
    ).all();
    res.json(users.map(u => ({ ...u, active: u.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/users/create', async (req, res) => {
  try {
    const { username, password, role, active } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.prepare(
      'INSERT INTO users (username, password, role, active, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, role, active ? 1 : 0, new Date().toISOString());
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.post('/api/users/update', async (req, res) => {
  try {
    const { id, password, role, active } = req.body;
    
    if (!id || !role) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    if (password && password.length > 0) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      db.prepare(
        'UPDATE users SET password = ?, role = ?, active = ? WHERE id = ?'
      ).run(hashedPassword, role, active ? 1 : 0, id);
    } else {
      db.prepare(
        'UPDATE users SET role = ?, active = ? WHERE id = ?'
      ).run(role, active ? 1 : 0, id);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

app.post('/api/users/delete', (req, res) => {
  try {
    const { id } = req.body;
    
    if (id == req.session.userId) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// ==================== FORMAS DE PAGO ====================

app.get('/api/payment-methods', (req, res) => {
  try {
    const methods = db.prepare(
      'SELECT * FROM payment_methods ORDER BY created_at DESC'
    ).all();
    res.json(methods.map(m => ({ ...m, active: m.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener formas de pago' });
  }
});

app.post('/api/payment-methods/create', (req, res) => {
  try {
    const { name, active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    db.prepare(
      'INSERT INTO payment_methods (name, active, created_at) VALUES (?, ?, ?)'
    ).run(name, active ? 1 : 0, new Date().toISOString());
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear forma de pago' });
  }
});

app.post('/api/payment-methods/update', (req, res) => {
  try {
    const { id, name, active } = req.body;
    
    db.prepare(
      'UPDATE payment_methods SET name = ?, active = ? WHERE id = ?'
    ).run(name, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar forma de pago' });
  }
});

app.post('/api/payment-methods/delete', (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar forma de pago' });
  }
});

// ==================== PROVEEDORES ====================

app.get('/api/suppliers', (req, res) => {
  try {
    const suppliers = db.prepare(
      'SELECT * FROM suppliers ORDER BY created_at DESC'
    ).all();
    res.json(suppliers.map(s => ({ ...s, active: s.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

app.post('/api/suppliers/create', (req, res) => {
  try {
    const { name, contact, phone, email, address, active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    db.prepare(
      'INSERT INTO suppliers (name, contact, phone, email, address, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name, contact || null, phone || null, email || null, address || null, active ? 1 : 0, new Date().toISOString());
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

app.post('/api/suppliers/update', (req, res) => {
  try {
    const { id, name, contact, phone, email, address, active } = req.body;
    
    db.prepare(
      'UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ?, active = ? WHERE id = ?'
    ).run(name, contact || null, phone || null, email || null, address || null, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

app.post('/api/suppliers/delete', (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// ==================== DEPARTAMENTOS ====================

app.get('/api/departments', (req, res) => {
  try {
    const departments = db.prepare(
      'SELECT * FROM departments ORDER BY created_at DESC'
    ).all();
    res.json(departments.map(d => ({ ...d, active: d.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
});

app.post('/api/departments/create', (req, res) => {
  try {
    const { name, description, active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    db.prepare(
      'INSERT INTO departments (name, description, active, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, description || null, active ? 1 : 0, new Date().toISOString());
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear departamento' });
  }
});

app.post('/api/departments/update', (req, res) => {
  try {
    const { id, name, description, active } = req.body;
    
    db.prepare(
      'UPDATE departments SET name = ?, description = ?, active = ? WHERE id = ?'
    ).run(name, description || null, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
});

app.post('/api/departments/delete', (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor POS corriendo en http://localhost:${PORT}`);
  console.log(`🚀 Listo para usar en Codespaces`);
});
