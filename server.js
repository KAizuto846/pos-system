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
  cookie: { secure: false } // Cambiar a true si usas HTTPS
}));

// API: Verificar si existe administrador
app.get('/api/check-admin', (req, res) => {
  try {
    const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    res.json({ adminExists: !!admin });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar administrador' });
  }
});

// API: Crear primer administrador
app.post('/api/create-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Verificar que no exista ya un admin
    const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    if (existingAdmin) {
      return res.status(400).json({ error: 'Ya existe un administrador' });
    }
    
    // Validaciones
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contrase\u00f1a son requeridos' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contrase\u00f1a debe tener al menos 6 caracteres' });
    }
    
    // Hash de la contrase\u00f1a
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insertar administrador
    const insert = db.prepare(
      'INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)'
    );
    const result = insert.run(username, hashedPassword, 'admin', new Date().toISOString());
    
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'admin';
    
    res.json({ success: true, message: 'Administrador creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
});

// API: Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contrase\u00f1a son requeridos' });
    }
    
    // Buscar usuario
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inv\u00e1lidas' });
    }
    
    // Verificar contrase\u00f1a
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inv\u00e1lidas' });
    }
    
    // Crear sesi\u00f3n
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

// API: Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API: Verificar sesi\u00f3n
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

app.listen(PORT, () => {
  console.log(`\u2705 Servidor POS corriendo en http://localhost:${PORT}`);
  console.log(`\ud83d\ude80 Listo para usar en Codespaces`);
});
