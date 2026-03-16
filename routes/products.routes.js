const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { getDB } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Obtener productos
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const products = db.prepare(`
      SELECT
        p.*,
        d.name as department_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.created_at DESC
    `).all();

    const productsWithLines = products.map(p => {
      const lines = db.prepare(`
        SELECT pl.id, pl.supplier_id, s.name as supplier_name, pl.is_primary
        FROM product_lines pl
        INNER JOIN suppliers s ON pl.supplier_id = s.id
        WHERE pl.product_id = ?
        ORDER BY pl.is_primary DESC
      `).all(p.id);

      return {
        ...p,
        active: p.active === 1,
        lowStock: p.stock <= p.min_stock,
        lines: lines || []
      };
    });

    res.json(productsWithLines);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Buscar productos
router.get('/search', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { q } = req.query;

    if (!q) {
      return res.json([]);
    }

    const products = db.prepare(`
      SELECT
        p.*,
        d.name as department_name,
        s.name as supplier_name
      FROM products p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.name LIKE ? OR p.barcode LIKE ?) AND p.active = 1
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`);

    res.json(products.map(p => ({ ...p, active: p.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar productos' });
  }
});

// Crear producto
router.post('/create', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Nombre y precio son requeridos' });
    }

    if (barcode) {
      const exists = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode);
      if (exists) {
        return res.status(400).json({ error: 'Ya existe un producto con ese código de barras' });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO products
      (name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      barcode || null,
      price,
      cost || 0,
      stock || 0,
      min_stock || 5,
      department_id || null,
      supplier_id || null,
      active ? 1 : 0,
      now,
      now
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Actualizar producto
router.post('/update', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id, name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active } = req.body;

    if (!id || !name || !price) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    if (barcode) {
      const exists = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(barcode, id);
      if (exists) {
        return res.status(400).json({ error: 'Ya existe otro producto con ese código de barras' });
      }
    }

    db.prepare(`
      UPDATE products
      SET name = ?, barcode = ?, price = ?, cost = ?, stock = ?, min_stock = ?,
          department_id = ?, supplier_id = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      barcode || null,
      price,
      cost || 0,
      stock || 0,
      min_stock || 5,
      department_id || null,
      supplier_id || null,
      active ? 1 : 0,
      new Date().toISOString(),
      id
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// Eliminar producto
router.post('/delete', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id } = req.body;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Ajustar stock
router.post('/adjust-stock', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const { id, adjustment } = req.body;

    if (!id || adjustment === undefined) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const newStock = product.stock + adjustment;

    if (newStock < 0) {
      return res.status(400).json({ error: 'El stock no puede ser negativo' });
    }

    db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, new Date().toISOString(), id);

    res.json({ success: true, newStock });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
});

// Importación masiva de Excel
router.post('/import', requireAuth, upload.single('file'), async (req, res) => {
  console.log('\n🚀 Iniciando importación masiva...');
  const startTime = Date.now();

  try {
    const db = getDB();

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    console.log('📖 Leyendo archivo Excel...');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`📊 Productos encontrados: ${data.length}`);

    if (data.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene productos' });
    }

    const lineaMap = {};
    const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE active = 1').all();

    const lineasUnicas = [...new Set(data.map(p => p['Línea'] || p['Linea']).filter(l => l))];
    console.log(`🏢 Líneas únicas encontradas: ${lineasUnicas.length}`);

    lineasUnicas.forEach(linea => {
      const lineaNum = parseInt(linea);
      if (isNaN(lineaNum)) return;

      const existing = suppliers.find(s => s.name === `Línea ${lineaNum}`);
      if (existing) {
        lineaMap[lineaNum] = existing.id;
      } else {
        const result = db.prepare(
          'INSERT INTO suppliers (name, active, created_at) VALUES (?, 1, ?)'
        ).run(`Línea ${lineaNum}`, new Date().toISOString());
        lineaMap[lineaNum] = result.lastInsertRowid;
      }
    });

    console.log('✅ Mapeo de líneas completado');

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO products
      (name, barcode, price, cost, stock, min_stock, supplier_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const insertMany = db.transaction((products) => {
      for (const p of products) {
        insertStmt.run(p);
      }
    });

    console.log('🔄 Procesando productos...');
    const now = new Date().toISOString();
    const productsToInsert = [];
    let skipped = 0;

    for (const row of data) {
      const name = (row['Descripción'] || row['Descripcion'] || '').trim();
      const barcode = String(row['Clave'] || '').trim();
      const precio = parseFloat(row['Precio público'] || row['Precio publico'] || 0);
      const existencias = parseFloat(row['Existencias'] || 0);
      const linea = parseInt(row['Línea'] || row['Linea'] || 0);

      if (!name || precio <= 0) {
        skipped++;
        continue;
      }

      const minStock = 1;
      const supplierId = lineaMap[linea] || null;

      productsToInsert.push([
        name,
        barcode || null,
        precio,
        0,
        existencias,
        minStock,
        supplierId,
        now,
        now
      ]);
    }

    console.log(`💾 Insertando ${productsToInsert.length} productos en lote...`);
    insertMany(productsToInsert);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Importación completada en ${duration}s`);

    res.json({
      success: true,
      imported: productsToInsert.length,
      skipped,
      duration: `${duration}s`,
      message: `${productsToInsert.length} productos importados exitosamente`
    });

  } catch (error) {
    console.error('❌ Error en importación:', error);
    res.status(500).json({ error: 'Error al importar productos: ' + error.message });
  } finally {
    if (req.file) {
      const fs = require('fs');
      fs.unlink(req.file.path, () => {});
    }
  }
});

// Entrada rápida de productos
router.post('/quick-entry', requireAuth, (req, res) => {
  const db = getDB();
  const processEntry = db.transaction((entryData) => {
    const { entries } = entryData;

    if (!entries || entries.length === 0) {
      throw new Error('No hay productos para procesar');
    }

    const updateStock = db.prepare(
      'UPDATE products SET stock = stock + ?, cost = ?, price = ?, updated_at = ? WHERE id = ?'
    );

    for (const entry of entries) {
      updateStock.run(
        entry.quantity,
        entry.pharmacy_price || 0,
        entry.public_price || 0,
        new Date().toISOString(),
        entry.product_id
      );
    }

    return entries.length;
  });

  try {
    const processedCount = processEntry(req.body);
    res.json({ success: true, processed: processedCount });
  } catch (error) {
    console.error('Error en entrada rápida:', error);
    res.status(500).json({ error: error.message || 'Error al procesar entrada de productos' });
  }
});

// Obtener líneas de un producto
router.get('/:productId/lines', requireAuth, (req, res) => {
  try {
    const db = getDB();
    const lines = db.prepare(`
      SELECT pl.id, s.id as supplier_id, s.name as supplier_name, pl.is_primary
      FROM product_lines pl
      INNER JOIN suppliers s ON pl.supplier_id = s.id
      WHERE pl.product_id = ?
      ORDER BY pl.is_primary DESC
    `).all(req.params.productId);

    res.json(lines);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener líneas' });
  }
});

// Agregar línea a un producto
router.post('/:productId/lines', requireRole(ROLES.ADMIN), (req, res) => {
  const db = getDB();
  const { supplierId, isPrimary } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO product_lines (product_id, supplier_id, is_primary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(req.params.productId, supplierId, isPrimary ? 1 : 0, new Date().toISOString());

    if (isPrimary) {
      db.prepare('UPDATE products SET primary_line_id = ? WHERE id = ?')
        .run(supplierId, req.params.productId);
    }

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar línea' });
  }
});

// Eliminar línea de un producto
router.delete('/:productId/lines/:lineId', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM product_lines WHERE id = ? AND product_id = ?')
      .run(req.params.lineId, req.params.productId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar línea' });
  }
});

module.exports = router;
