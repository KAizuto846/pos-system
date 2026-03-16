const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Crear venta
router.post('/create', requireAuth, (req, res) => {
  const db = getDB();
  const createSale = db.transaction((saleData) => {
    const { items, payment_method_id, total } = saleData;

    if (!items || items.length === 0) {
      throw new Error('No hay productos en la venta');
    }

    const saleResult = db.prepare(
      'INSERT INTO sales (total, payment_method_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(total, payment_method_id, req.session.userId, new Date().toISOString());

    const saleId = saleResult.lastInsertRowid;

    const insertItem = db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
    );

    const updateStock = db.prepare(
      'UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?'
    );

    for (const item of items) {
      const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);

      if (!product) {
        throw new Error(`Producto ID ${item.product_id} no encontrado`);
      }

      insertItem.run(saleId, item.product_id, item.quantity, item.price);
      updateStock.run(item.quantity, new Date().toISOString(), item.product_id);
    }

    return saleId;
  });

  try {
    const saleId = createSale(req.body);
    res.json({ success: true, saleId });
  } catch (error) {
    console.error('Error creando venta:', error);
    res.status(500).json({ error: error.message || 'Error al procesar la venta' });
  }
});

module.exports = router;
