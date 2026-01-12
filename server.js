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

// Middleware de autenticación
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

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

app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const products = db.prepare('SELECT COUNT(*) as count FROM products WHERE active = 1').get().count;
    
    const today = new Date().toISOString().split('T')[0];
    const sales = db.prepare(
      'SELECT COUNT(*) as count FROM sales WHERE DATE(created_at) = ?'
    ).get(today).count;
    
    const revenue = db.prepare(
      'SELECT COALESCE(SUM(total), 0) as sum FROM sales WHERE DATE(created_at) = ?'
    ).get(today).sum;
    
    // Total en caja (solo métodos que afectan caja)
    const cashTotal = db.prepare(`
      SELECT COALESCE(SUM(s.total), 0) as sum 
      FROM sales s
      INNER JOIN payment_methods pm ON s.payment_method_id = pm.id
      WHERE DATE(s.created_at) = ? AND pm.affects_cash = 1
    `).get(today).sum;
    
    // Ventas por cajero
    const salesByCashier = db.prepare(`
      SELECT 
        u.username,
        COUNT(s.id) as sales_count,
        COALESCE(SUM(s.total), 0) as total
      FROM users u
      LEFT JOIN sales s ON s.user_id = u.id AND DATE(s.created_at) = ?
      WHERE u.active = 1
      GROUP BY u.id, u.username
      ORDER BY total DESC
    `).all(today);
    
    // Productos con stock bajo
    const lowStock = db.prepare(
      'SELECT COUNT(*) as count FROM products WHERE stock <= min_stock AND active = 1'
    ).get().count;
    
    res.json({ 
      users, 
      products, 
      sales, 
      revenue,
      cashTotal,
      lowStock,
      salesByCashier
    });
  } catch (error) {
    console.error(error);
    res.json({ users: 0, products: 0, sales: 0, revenue: 0, cashTotal: 0, lowStock: 0, salesByCashier: [] });
  }
});

// ==================== USUARIOS ====================

app.get('/api/users', requireAuth, (req, res) => {
  try {
    const users = db.prepare(
      'SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC'
    ).all();
    res.json(users.map(u => ({ ...u, active: u.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/users/create', requireAuth, async (req, res) => {
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

app.post('/api/users/update', requireAuth, async (req, res) => {
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

app.post('/api/users/delete', requireAuth, (req, res) => {
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

app.get('/api/payment-methods', requireAuth, (req, res) => {
  try {
    const methods = db.prepare(
      'SELECT * FROM payment_methods ORDER BY created_at DESC'
    ).all();
    res.json(methods.map(m => ({ 
      ...m, 
      active: m.active === 1,
      affects_cash: m.affects_cash === 1 
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener formas de pago' });
  }
});

app.post('/api/payment-methods/create', requireAuth, (req, res) => {
  try {
    const { name, affects_cash, active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    db.prepare(
      'INSERT INTO payment_methods (name, affects_cash, active, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, affects_cash ? 1 : 0, active ? 1 : 0, new Date().toISOString());
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear forma de pago' });
  }
});

app.post('/api/payment-methods/update', requireAuth, (req, res) => {
  try {
    const { id, name, affects_cash, active } = req.body;
    
    db.prepare(
      'UPDATE payment_methods SET name = ?, affects_cash = ?, active = ? WHERE id = ?'
    ).run(name, affects_cash ? 1 : 0, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar forma de pago' });
  }
});

app.post('/api/payment-methods/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar forma de pago' });
  }
});

// ==================== PROVEEDORES ====================

app.get('/api/suppliers', requireAuth, (req, res) => {
  try {
    const suppliers = db.prepare(
      'SELECT * FROM suppliers ORDER BY created_at DESC'
    ).all();
    res.json(suppliers.map(s => ({ ...s, active: s.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

app.post('/api/suppliers/create', requireAuth, (req, res) => {
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

app.post('/api/suppliers/update', requireAuth, (req, res) => {
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

app.post('/api/suppliers/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// ==================== DEPARTAMENTOS ====================

app.get('/api/departments', requireAuth, (req, res) => {
  try {
    const departments = db.prepare(
      'SELECT * FROM departments ORDER BY created_at DESC'
    ).all();
    res.json(departments.map(d => ({ ...d, active: d.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
});

app.post('/api/departments/create', requireAuth, (req, res) => {
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

app.post('/api/departments/update', requireAuth, (req, res) => {
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

app.post('/api/departments/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
});

// ==================== PRODUCTOS ====================

app.get('/api/products', requireAuth, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT 
        p.*,
        d.name as department_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.created_at DESC
    `).all();
    
    res.json(products.map(p => ({ 
      ...p, 
      active: p.active === 1,
      lowStock: p.stock <= p.min_stock
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.get('/api/products/search', requireAuth, (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.json([]);
    }
    
    const products = db.prepare(`
      SELECT 
        p.*,
        d.name as department_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.name LIKE ? OR p.barcode LIKE ?) AND p.active = 1
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`);
    
    res.json(products.map(p => ({ ...p, active: p.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar productos' });
  }
});

app.post('/api/products/create', requireAuth, (req, res) => {
  try {
    const { name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Nombre y precio son requeridos' });
    }
    
    if (barcode) {
      const exists = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
      if (exists) {
        return res.status(400).json({ error: 'Ya existe un producto con ese código de barras' });
      }
    }
    
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO products 
      (name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, 
      barcode || null, 
      price, 
      cost || 0, 
      stock || 0, 
      min_stock || 5,
      department_id || null,
      supplier_id || null,
      active ? 1 : 0,
      now,
      now
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

app.post('/api/products/update', requireAuth, (req, res) => {
  try {
    const { id, name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active } = req.body;
    
    if (!id || !name || !price) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    if (barcode) {
      const exists = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(barcode, id);
      if (exists) {
        return res.status(400).json({ error: 'Ya existe otro producto con ese código de barras' });
      }
    }
    
    db.prepare(`
      UPDATE products 
      SET name = ?, barcode = ?, price = ?, cost = ?, stock = ?, min_stock = ?, 
          department_id = ?, supplier_id = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      barcode || null,
      price,
      cost || 0,
      stock || 0,
      min_stock || 5,
      department_id || null,
      supplier_id || null,
      active ? 1 : 0,
      new Date().toISOString(),
      id
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

app.post('/api/products/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

app.post('/api/products/adjust-stock', requireAuth, (req, res) => {
  try {
    const { id, adjustment } = req.body;
    
    if (!id || adjustment === undefined) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const newStock = product.stock + adjustment;
    
    if (newStock < 0) {
      return res.status(400).json({ error: 'El stock no puede ser negativo' });
    }
    
    db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, new Date().toISOString(), id);
    
    res.json({ success: true, newStock });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor POS corriendo en http://localhost:${PORT}`);
  console.log(`🚀 Listo para usar en Codespaces`);
});
