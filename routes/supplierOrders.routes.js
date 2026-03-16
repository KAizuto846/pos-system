const express = require('express');
const { getDB } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { ORDER_STATUS, VALID_STATUSES } = require('../constants/orderStatus');

const router = express.Router();

// Obtener pedidos de proveedor (legacy)
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { status, supplierId, lineId } = req.query;

    let query = `
      SELECT so.*, p.name as product_name, p.barcode, s.name as supplier_name
      FROM supplier_orders so
      INNER JOIN products p ON so.product_id = p.id
      INNER JOIN suppliers s ON so.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND so.status = ?`;
      params.push(status);
    }

    if (supplierId) {
      query += ` AND so.supplier_id = ?`;
      params.push(supplierId);
    }

    if (lineId) {
      query += ` AND p.primary_line_id = ?`;
      params.push(lineId);
    }

    query += ` ORDER BY so.created_at DESC`;

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// Crear pedido de proveedor (legacy)
router.post('/', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { productId, supplierId, quantity } = req.body;

  if (!productId || !supplierId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO supplier_orders (product_id, supplier_id, quantity, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(productId, supplierId, quantity, ORDER_STATUS.PENDING, new Date().toISOString());

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido' });
  }
});

// Marcar como recibido (legacy)
router.patch('/:orderId/receive', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { receivedQuantity } = req.body;

  try {
    db.prepare(`
      UPDATE supplier_orders
      SET received_quantity = ?, received = 1, status = ?, received_at = ?
      WHERE id = ?
    `).run(receivedQuantity || 0, ORDER_STATUS.RECEIVED, new Date().toISOString(), req.params.orderId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar como recibido' });
  }
});

// Crear pedido de proveedor (cabecera)
router.post('/create-header', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { supplierId, notes } = req.body;

  if (!supplierId) {
    return res.status(400).json({ error: 'supplierId requerido' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO supplier_orders (supplier_id, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(supplierId, ORDER_STATUS.DRAFT, notes || '', new Date().toISOString(), new Date().toISOString());

    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido' });
  }
});

// Obtener items de un pedido
router.get('/:orderId/items', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const items = db.prepare(`
      SELECT
        soi.id,
        soi.product_id,
        p.name as product_name,
        p.barcode,
        soi.quantity,
        soi.received_quantity,
        soi.received,
        soi.notes
      FROM supplier_order_items soi
      INNER JOIN products p ON soi.product_id = p.id
      WHERE soi.supplier_order_id = ?
      ORDER BY soi.created_at ASC
    `).all(req.params.orderId);

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener items' });
  }
});

// Agregar item a un pedido
router.post('/:orderId/items', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { productId, quantity, notes } = req.body;

  if (!productId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'productId y quantity requeridos' });
  }

  try {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const existing = db.prepare(
      'SELECT id FROM supplier_order_items WHERE supplier_order_id = ? AND product_id = ?'
    ).get(req.params.orderId, productId);

    if (existing) {
      return res.status(400).json({ error: 'El producto ya está en este pedido' });
    }

    const result = db.prepare(`
      INSERT INTO supplier_order_items (supplier_order_id, product_id, quantity, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.orderId, productId, quantity, notes || '', new Date().toISOString(), new Date().toISOString());

    res.json({ success: true, itemId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar item' });
  }
});

// Actualizar item del pedido
router.patch('/:orderId/items/:itemId', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { quantity, notes, received, receivedQuantity } = req.body;

  try {
    let updates = [];
    let params = [];

    if (quantity !== undefined && quantity > 0) {
      updates.push('quantity = ?');
      params.push(quantity);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (received !== undefined) {
      updates.push('received = ?');
      params.push(received ? 1 : 0);
    }

    if (receivedQuantity !== undefined && receivedQuantity >= 0) {
      updates.push('received_quantity = ?');
      params.push(receivedQuantity);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(req.params.orderId);
    params.push(req.params.itemId);

    db.prepare(`
      UPDATE supplier_order_items
      SET ${updates.join(', ')}
      WHERE supplier_order_id = ? AND id = ?
    `).run(...params);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

// Eliminar item del pedido
router.delete('/:orderId/items/:itemId', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM supplier_order_items WHERE id = ? AND supplier_order_id = ?')
      .run(req.params.itemId, req.params.orderId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar item' });
  }
});

// Marcar item como recibido
router.patch('/:orderId/items/:itemId/receive', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { receivedQuantity } = req.body;

  try {
    const item = db.prepare(
      'SELECT quantity FROM supplier_order_items WHERE id = ? AND supplier_order_id = ?'
    ).get(req.params.itemId, req.params.orderId);

    if (!item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const finalQuantity = receivedQuantity !== undefined ? receivedQuantity : item.quantity;

    db.prepare(`
      UPDATE supplier_order_items
      SET received_quantity = ?, received = 1, updated_at = ?
      WHERE id = ? AND supplier_order_id = ?
    `).run(finalQuantity, new Date().toISOString(), req.params.itemId, req.params.orderId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar como recibido' });
  }
});

// Actualizar estado del pedido
router.patch('/:orderId/status', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    db.prepare(`
      UPDATE supplier_orders
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, new Date().toISOString(), req.params.orderId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// Obtener todos los pedidos con resumen
router.get('/list', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { supplierId, status } = req.query;

    let query = `
      SELECT
        so.id,
        so.supplier_id,
        s.name as supplier_name,
        so.status,
        so.notes,
        so.created_at,
        COUNT(soi.id) as item_count,
        SUM(CASE WHEN soi.received = 1 THEN 1 ELSE 0 END) as received_count
      FROM supplier_orders so
      INNER JOIN suppliers s ON so.supplier_id = s.id
      LEFT JOIN supplier_order_items soi ON so.id = soi.supplier_order_id
      WHERE 1=1
    `;

    const params = [];

    if (supplierId) {
      query += ' AND so.supplier_id = ?';
      params.push(supplierId);
    }

    if (status) {
      query += ' AND so.status = ?';
      params.push(status);
    }

    query += ` GROUP BY so.id ORDER BY so.created_at DESC`;

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// Obtener un pedido completo (cabecera + items)
router.get('/:orderId/complete', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const order = db.prepare(`
      SELECT
        so.id,
        so.supplier_id,
        s.name as supplier_name,
        so.status,
        so.notes,
        so.created_at,
        so.updated_at
      FROM supplier_orders so
      INNER JOIN suppliers s ON so.supplier_id = s.id
      WHERE so.id = ?
    `).get(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const items = db.prepare(`
      SELECT
        soi.id,
        soi.product_id,
        p.name as product_name,
        p.barcode,
        soi.quantity,
        soi.received_quantity,
        soi.received,
        soi.notes
      FROM supplier_order_items soi
      INNER JOIN products p ON soi.product_id = p.id
      WHERE soi.supplier_order_id = ?
      ORDER BY soi.created_at ASC
    `).all(req.params.orderId);

    res.json({ ...order, items });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
});

// Eliminar pedido (solo si está en draft)
router.delete('/:orderId', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const db = getDB();
    const order = db.prepare('SELECT status FROM supplier_orders WHERE id = ?').get(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (order.status !== ORDER_STATUS.DRAFT) {
      return res.status(400).json({ error: 'Solo puedes eliminar pedidos en draft' });
    }

    db.prepare('DELETE FROM supplier_order_items WHERE supplier_order_id = ?').run(req.params.orderId);
    db.prepare('DELETE FROM supplier_orders WHERE id = ?').run(req.params.orderId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
});

module.exports = router;
