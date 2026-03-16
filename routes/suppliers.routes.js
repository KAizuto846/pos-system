const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener proveedores
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const suppliers = db.prepare(
      'SELECT * FROM suppliers ORDER BY created_at DESC'
    ).all();
    res.json(suppliers.map(s => ({ ...s, active: s.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// Crear proveedor
router.post('/create', requireAuth, (req, res) => {
  try {
    const db = getDB();
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

// Actualizar proveedor
router.post('/update', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id, name, contact, phone, email, address, active } = req.body;

    db.prepare(
      'UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ?, active = ? WHERE id = ?'
    ).run(name, contact || null, phone || null, email || null, address || null, active ? 1 : 0, id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// Eliminar proveedor
router.post('/delete', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id } = req.body;
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

module.exports = router;
