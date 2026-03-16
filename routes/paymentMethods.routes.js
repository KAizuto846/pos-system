const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener formas de pago
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const methods = db.prepare(
      'SELECT * FROM payment_methods ORDER BY created_at DESC'
    ).all();
    res.json(methods.map(m => ({
      ...m,
      active: m.active === 1,
      affects_cash: m.affects_cash === 1
    })));
  } catch (error) {
    console.error('Error en payment-methods:', error);
    res.status(500).json({ error: 'Error al obtener formas de pago' });
  }
});

// Crear forma de pago
router.post('/create', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { name, affects_cash, active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    db.prepare(
      'INSERT INTO payment_methods (name, affects_cash, active, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, affects_cash ? 1 : 0, active ? 1 : 0, new Date().toISOString());

    res.json({ success: true });
  } catch (error) {
    console.error('Error creando payment method:', error);
    res.status(500).json({ error: 'Error al crear forma de pago: ' + error.message });
  }
});

// Actualizar forma de pago
router.post('/update', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id, name, affects_cash, active } = req.body;

    db.prepare(
      'UPDATE payment_methods SET name = ?, affects_cash = ?, active = ? WHERE id = ?'
    ).run(name, affects_cash ? 1 : 0, active ? 1 : 0, id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar forma de pago' });
  }
});

// Eliminar forma de pago
router.post('/delete', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id } = req.body;
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar forma de pago' });
  }
});

module.exports = router;
