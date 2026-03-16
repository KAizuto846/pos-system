const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener departamentos
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const departments = db.prepare(
      'SELECT * FROM departments ORDER BY created_at DESC'
    ).all();
    res.json(departments.map(d => ({ ...d, active: d.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
});

// Crear departamento
router.post('/create', requireAuth, (req, res) => {
  try {
    const db = getDB();
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

// Actualizar departamento
router.post('/update', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id, name, description, active } = req.body;

    db.prepare(
      'UPDATE departments SET name = ?, description = ?, active = ? WHERE id = ?'
    ).run(name, description || null, active ? 1 : 0, id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
});

// Eliminar departamento
router.post('/delete', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id } = req.body;
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
});

module.exports = router;
