const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Estadísticas del dashboard
router.get('/stats', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const products = db.prepare('SELECT COUNT(*) as count FROM products WHERE active = 1').get().count;

    const today = new Date().toISOString().split('T')[0];
    const sales = db.prepare(
      'SELECT COUNT(*) as count FROM sales WHERE DATE(created_at) = ?'
    ).get(today).count;

    const revenue = db.prepare(
      'SELECT COALESCE(SUM(total), 0) as sum FROM sales WHERE DATE(created_at) = ?'
    ).get(today).sum;

    const cashTotal = db.prepare(`
      SELECT COALESCE(SUM(s.total), 0) as sum
      FROM sales s
      INNER JOIN payment_methods pm ON s.payment_method_id = pm.id
      WHERE DATE(s.created_at) = ? AND pm.affects_cash = 1
    `).get(today).sum;

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

// Reporte resumen de ventas
router.get('/sales', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate, userId, paymentId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    let whereClause = 'WHERE DATE(s.created_at) BETWEEN ? AND ?';
    let params = [startDate, endDate];

    if (userId) {
      whereClause += ' AND s.user_id = ?';
      params.push(userId);
    }

    if (paymentId) {
      whereClause += ' AND s.payment_method_id = ?';
      params.push(paymentId);
    }

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(s.total), 0) as total,
        COUNT(s.id) as tickets,
        COALESCE(SUM(CASE WHEN pm.affects_cash = 1 THEN s.total ELSE 0 END), 0) as cash
      FROM sales s
      LEFT JOIN payment_methods pm ON s.payment_method_id = pm.id
      ${whereClause}
    `).get(...params);

    const byPaymentMethod = db.prepare(`
      SELECT
        pm.name,
        COUNT(s.id) as tickets,
        COALESCE(SUM(s.total), 0) as total
      FROM sales s
      INNER JOIN payment_methods pm ON s.payment_method_id = pm.id
      ${whereClause}
      GROUP BY pm.id, pm.name
      ORDER BY total DESC
    `).all(...params);

    res.json({
      total: summary.total,
      tickets: summary.tickets,
      cash: summary.cash,
      byPaymentMethod
    });
  } catch (error) {
    console.error('Error en reporte de ventas:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Top productos vendidos
router.get('/top-products', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    const topProducts = db.prepare(`
      SELECT
        p.name,
        SUM(si.quantity) as quantity,
        SUM(si.quantity * si.price) as total
      FROM sale_items si
      INNER JOIN products p ON si.product_id = p.id
      INNER JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY p.id, p.name
      ORDER BY total DESC
      LIMIT 10
    `).all(startDate, endDate);

    res.json(topProducts);
  } catch (error) {
    console.error('Error en top productos:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Ventas por cajero
router.get('/by-cashier', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    const byCashier = db.prepare(`
      SELECT
        u.username,
        COUNT(s.id) as tickets,
        COALESCE(SUM(s.total), 0) as total
      FROM users u
      LEFT JOIN sales s ON s.user_id = u.id AND DATE(s.created_at) BETWEEN ? AND ?
      WHERE u.active = 1
      GROUP BY u.id, u.username
      HAVING tickets > 0
      ORDER BY total DESC
    `).all(startDate, endDate);

    res.json(byCashier);
  } catch (error) {
    console.error('Error en reporte por cajero:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Inventario con stock bajo
router.get('/low-stock', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const lowStock = db.prepare(`
      SELECT
        name,
        barcode,
        stock,
        min_stock
      FROM products
      WHERE stock <= min_stock AND active = 1
      ORDER BY (stock - min_stock) ASC
    `).all();

    res.json(lowStock);
  } catch (error) {
    console.error('Error en reporte de stock bajo:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Ventas detalladas (agrupado por producto)
router.get('/detailed-sales', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate, supplierId, userId, paymentMethodId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    let whereClause = 'WHERE DATE(s.created_at) BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (supplierId) {
      whereClause += ' AND p.supplier_id = ?';
      params.push(supplierId);
    }

    if (userId) {
      whereClause += ' AND s.user_id = ?';
      params.push(userId);
    }

    if (paymentMethodId) {
      whereClause += ' AND s.payment_method_id = ?';
      params.push(paymentMethodId);
    }

    const rows = db.prepare(`
      SELECT
        SUM(si.quantity) as quantity,
        p.name as product_name,
        p.barcode as barcode,
        COALESCE(p.cost, 0) as cost_farmacia_unit,
        SUM(si.quantity * COALESCE(p.cost, 0)) as cost_farmacia_total,
        AVG(si.price) as sale_price_unit,
        SUM(si.quantity * si.price) as sale_total
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      ${whereClause}
      GROUP BY p.id, p.name, p.barcode, p.cost
      ORDER BY sale_total DESC
    `).all(...params);

    res.json(rows.map(r => ({
      quantity: Number(r.quantity || 0),
      product_name: r.product_name,
      barcode: r.barcode,
      cost_farmacia_unit: Number(r.cost_farmacia_unit || 0),
      cost_farmacia_total: Number(r.cost_farmacia_total || 0),
      sale_price_unit: Number(r.sale_price_unit || 0),
      sale_total: Number(r.sale_total || 0)
    })));
  } catch (error) {
    console.error('Error en /api/reports/detailed-sales:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Pedido por proveedor (agrupado por producto)
router.get('/supplier-order', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate, supplierId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    if (!supplierId) {
      return res.status(400).json({ error: 'supplierId es requerido para Pedido Proveedor' });
    }

    let rows = db.prepare(`
      SELECT
        SUM(si.quantity) as quantity,
        p.name as product_name,
        p.barcode as barcode,
        p.id as product_id
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      INNER JOIN product_lines pl ON p.id = pl.product_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND pl.supplier_id = ?
        AND pl.is_primary = 1
      GROUP BY p.id, p.name, p.barcode
      ORDER BY quantity DESC
    `).all(startDate, endDate, supplierId);

    if (!rows || rows.length === 0) {
      console.log('ℹ️ No hay product_lines, usando supplier_id directo');
      rows = db.prepare(`
        SELECT
          SUM(si.quantity) as quantity,
          p.name as product_name,
          p.barcode as barcode,
          p.id as product_id
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN products p ON si.product_id = p.id
        WHERE DATE(s.created_at) BETWEEN ? AND ?
          AND p.supplier_id = ?
        GROUP BY p.id, p.name, p.barcode
        ORDER BY quantity DESC
      `).all(startDate, endDate, supplierId);
    }

    res.json(rows.map(r => ({
      quantity: Number(r.quantity || 0),
      product_name: r.product_name,
      barcode: r.barcode,
      product_id: r.product_id
    })));
  } catch (error) {
    console.error('Error en /api/reports/supplier-order:', error);
    res.status(500).json({ error: 'Error al generar reporte: ' + error.message });
  }
});

// Historial de ventas (por item; no agrupado)
router.get('/sales-history', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { startDate, endDate, supplierId, userId, paymentMethodId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    let whereClause = 'WHERE DATE(s.created_at) BETWEEN ? AND ?';
    const params = [startDate, endDate];

    if (supplierId) {
      whereClause += ' AND p.supplier_id = ?';
      params.push(supplierId);
    }

    if (userId) {
      whereClause += ' AND s.user_id = ?';
      params.push(userId);
    }

    if (paymentMethodId) {
      whereClause += ' AND s.payment_method_id = ?';
      params.push(paymentMethodId);
    }

    const rows = db.prepare(`
      SELECT
        si.quantity as quantity,
        p.name as product_name,
        p.barcode as barcode,
        (si.quantity * COALESCE(p.cost, 0)) as cost_farmacia_total,
        (si.quantity * si.price) as sale_total
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      ${whereClause}
      ORDER BY s.created_at DESC
    `).all(...params);

    res.json(rows.map(r => ({
      quantity: Number(r.quantity || 0),
      product_name: r.product_name,
      barcode: r.barcode,
      cost_farmacia_total: Number(r.cost_farmacia_total || 0),
      sale_total: Number(r.sale_total || 0)
    })));
  } catch (error) {
    console.error('Error en /api/reports/sales-history:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

module.exports = router;
