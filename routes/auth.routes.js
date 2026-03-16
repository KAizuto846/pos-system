const express = require('express');
const bcrypt = require('bcrypt');
const { getDB } = require('../database/init');
const { ROLES } = require('../constants/roles');

const router = express.Router();

// Verificar si existe administrador
router.get('/check-admin', (req, res) => {
  try {
    const db = getDB();
    const admin = db.prepare('SELECT id FROM users WHERE role = ?').get(ROLES.ADMIN);
    res.json({ adminExists: !!admin });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar administrador' });
  }
});

// Crear administrador inicial
router.post('/create-admin', async (req, res) => {
  try {
    const db = getDB();
    const { username, password } = req.body;

    const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get(ROLES.ADMIN);
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
    const result = insert.run(username, hashedPassword, ROLES.ADMIN, 1, new Date().toISOString());

    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = ROLES.ADMIN;

    res.json({ success: true, message: 'Administrador creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const db = getDB();
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
        id: user.id,
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
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Sesión actual
router.get('/session', (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
