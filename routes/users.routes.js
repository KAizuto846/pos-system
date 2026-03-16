const express = require('express');
const bcrypt = require('bcrypt');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener usuarios
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const users = db.prepare(
      'SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC'
    ).all();
    res.json(users.map(u => ({ ...u, active: u.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Crear usuario
router.post('/create', requireAuth, async (req, res) => {
  try {
    const db = getDB();
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

// Actualizar usuario
router.post('/update', requireAuth, async (req, res) => {
  try {
    const db = getDB();
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

// Eliminar usuario
router.post('/delete', requireAuth, (req, res) => {
  try {
    const db = getDB();
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

module.exports = router;
