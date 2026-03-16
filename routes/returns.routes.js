const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Crear devolución
router.post('/create', requireAuth, (req, res) => {
  const db = getDB();
  const processReturn = db.transaction((returnData) => {
    const { items, reason, notes, total } = returnData;

    if (!items || items.length === 0) {
      throw new Error('No hay productos en la devolución');
    }

    const returnResult = db.prepare(
      'INSERT INTO sales (total, payment_method_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(-total, null, req.session.userId, new Date().toISOString());

    const returnId = returnResult.lastInsertRowid;

    const insertItem = db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
    );

    const updateStock = db.prepare(
      'UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?'
    );

    for (const item of items) {
      insertItem.run(returnId, item.product_id, item.quantity, item.price);
      updateStock.run(item.quantity, new Date().toISOString(), item.product_id);
    }

    return returnId;
  });

  try {
    const returnId = processReturn(req.body);
    res.json({ success: true, returnId });
  } catch (error) {
    console.error('Error procesando devolución:', error);
    res.status(500).json({ error: error.message || 'Error al procesar la devolución' });
  }
});

module.exports = router;
