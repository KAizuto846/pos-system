const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { initDatabase, getDB } = require('./database/init');
const config = require('./config');

const app = express();

// Configurar multer para subida de archivos
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Inicializar base de datos
initDatabase();
const db = getDB();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));
app.use(session(config.session));

// Middleware de autenticación
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ==================== AUTENTICACIÓN ====================

app.get('/api/check-admin', (req, res) => {
  try {
    const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    res.json({ adminExists: !!admin });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar administrador' });
  }
});

app.post('/api/create-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
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
    const result = insert.run(username, hashedPassword, 'admin', 1, new Date().toISOString());
    
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'admin';
    
    res.json({ success: true, message: 'Administrador creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
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

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
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

// ==================== ESTADÍSTICAS ====================

app.get('/api/stats', requireAuth, (req, res) => {
  try {
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

// ==================== USUARIOS ====================

app.get('/api/users', requireAuth, (req, res) => {
  try {
    const users = db.prepare(
      'SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC'
    ).all();
    res.json(users.map(u => ({ ...u, active: u.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/users/create', requireAuth, async (req, res) => {
  try {
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

app.post('/api/users/update', requireAuth, async (req, res) => {
  try {
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

app.post('/api/users/delete', requireAuth, (req, res) => {
  try {
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

// ==================== FORMAS DE PAGO ====================

app.get('/api/payment-methods', requireAuth, (req, res) => {
  try {
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

app.post('/api/payment-methods/create', requireAuth, (req, res) => {
  try {
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

app.post('/api/payment-methods/update', requireAuth, (req, res) => {
  try {
    const { id, name, affects_cash, active } = req.body;
    
    db.prepare(
      'UPDATE payment_methods SET name = ?, affects_cash = ?, active = ? WHERE id = ?'
    ).run(name, affects_cash ? 1 : 0, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar forma de pago' });
  }
});

app.post('/api/payment-methods/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar forma de pago' });
  }
});

// ==================== PROVEEDORES ====================

app.get('/api/suppliers', requireAuth, (req, res) => {
  try {
    const suppliers = db.prepare(
      'SELECT * FROM suppliers ORDER BY created_at DESC'
    ).all();
    res.json(suppliers.map(s => ({ ...s, active: s.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

app.post('/api/suppliers/create', requireAuth, (req, res) => {
  try {
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

app.post('/api/suppliers/update', requireAuth, (req, res) => {
  try {
    const { id, name, contact, phone, email, address, active } = req.body;
    
    db.prepare(
      'UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ?, active = ? WHERE id = ?'
    ).run(name, contact || null, phone || null, email || null, address || null, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

app.post('/api/suppliers/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// ==================== DEPARTAMENTOS ====================

app.get('/api/departments', requireAuth, (req, res) => {
  try {
    const departments = db.prepare(
      'SELECT * FROM departments ORDER BY created_at DESC'
    ).all();
    res.json(departments.map(d => ({ ...d, active: d.active === 1 })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
});

app.post('/api/departments/create', requireAuth, (req, res) => {
  try {
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

app.post('/api/departments/update', requireAuth, (req, res) => {
  try {
    const { id, name, description, active } = req.body;
    
    db.prepare(
      'UPDATE departments SET name = ?, description = ?, active = ? WHERE id = ?'
    ).run(name, description || null, active ? 1 : 0, id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar departamento' });
  }
});

app.post('/api/departments/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar departamento' });
  }
});

// ==================== PRODUCTOS ====================

app.get('/api/products', requireAuth, (req, res) => {
  try {
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
    
    // Obtener líneas para cada producto
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

app.get('/api/products/search', requireAuth, (req, res) => {
  try {
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

app.post('/api/products/create', requireAuth, (req, res) => {
  try {
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

app.post('/api/products/update', requireAuth, (req, res) => {
  try {
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

app.post('/api/products/delete', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

app.post('/api/products/adjust-stock', requireAuth, (req, res) => {
  try {
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

// ==================== IMPORTACIÓN MASIVA DE EXCEL ====================

app.post('/api/products/import', requireAuth, upload.single('file'), async (req, res) => {
  console.log('\n🚀 Iniciando importación masiva...');
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    
    // Leer archivo Excel
    console.log('📖 Leyendo archivo Excel...');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    console.log(`📊 Productos encontrados: ${data.length}`);
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene productos' });
    }
    
    // Mapeo de líneas a supplier_id
    const lineaMap = {};
    const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE active = 1').all();
    
    // Crear proveedores para líneas si no existen
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
    
    // Preparar sentencia para inserción en lote
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO products 
      (name, barcode, price, cost, stock, min_stock, supplier_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    
    // Usar transacción para velocidad
    const insertMany = db.transaction((products) => {
      for (const p of products) {
        insertStmt.run(p);
      }
    });
    
    // Preparar datos
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
      
      // Stock mínimo = 1 para todos como solicitaste
      const minStock = 1;
      const supplierId = lineaMap[linea] || null;
      
      productsToInsert.push([
        name,
        barcode || null,
        precio,
        0, // costo por defecto
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
    // Limpiar archivo temporal
    if (req.file) {
      const fs = require('fs');
      fs.unlink(req.file.path, () => {});
    }
  }
});

// ==================== VENTAS ====================

app.post('/api/sales/create', requireAuth, (req, res) => {
  const createSale = db.transaction((saleData) => {
    try {
      const { items, payment_method_id, total } = saleData;
      
      if (!items || items.length === 0) {
        throw new Error('No hay productos en la venta');
      }
      
      // Crear venta
      const saleResult = db.prepare(
        'INSERT INTO sales (total, payment_method_id, user_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(total, payment_method_id, req.session.userId, new Date().toISOString());
      
      const saleId = saleResult.lastInsertRowid;
      
      // Insertar items y actualizar stock
      const insertItem = db.prepare(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
      );
      
      const updateStock = db.prepare(
        'UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?'
      );
      
      for (const item of items) {
        // Verificar que el producto existe (pero permitir venta sin stock)
        const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
        
        if (!product) {
          throw new Error(`Producto ID ${item.product_id} no encontrado`);
        }
        
        // Permitir venta incluso si stock es insuficiente
        // Insertar item
        insertItem.run(saleId, item.product_id, item.quantity, item.price);
        
        // Actualizar stock (puede quedarse negativo)
        updateStock.run(item.quantity, new Date().toISOString(), item.product_id);
      }
      
      return saleId;
    } catch (error) {
      throw error;
    }
  });
  
  try {
    const saleId = createSale(req.body);
    res.json({ success: true, saleId });
  } catch (error) {
    console.error('Error creando venta:', error);
    res.status(500).json({ error: error.message || 'Error al procesar la venta' });
  }
});

// ==================== DEVOLUCIONES ====================

app.post('/api/returns/create', requireAuth, (req, res) => {
  const processReturn = db.transaction((returnData) => {
    try {
      const { items, reason, notes, total } = returnData;
      
      if (!items || items.length === 0) {
        throw new Error('No hay productos en la devolución');
      }
      
      // Crear devolución (usando tabla de sales como referencia)
      const returnResult = db.prepare(
        'INSERT INTO sales (total, payment_method_id, user_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(-total, null, req.session.userId, new Date().toISOString());
      
      const returnId = returnResult.lastInsertRowid;
      
      // Insertar items y actualizar stock (AGREGAR stock en lugar de restar)
      const insertItem = db.prepare(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
      );
      
      const updateStock = db.prepare(
        'UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?'
      );
      
      for (const item of items) {
        // Insertar item
        insertItem.run(returnId, item.product_id, item.quantity, item.price);
        
        // Actualizar stock (sumar porque es devolución)
        updateStock.run(item.quantity, new Date().toISOString(), item.product_id);
      }
      
      return returnId;
    } catch (error) {
      throw error;
    }
  });
  
  try {
    const returnId = processReturn(req.body);
    res.json({ success: true, returnId });
  } catch (error) {
    console.error('Error procesando devolución:', error);
    res.status(500).json({ error: error.message || 'Error al procesar la devolución' });
  }
});

// ==================== ENTRADA RÁPIDA DE PRODUCTOS ====================

app.post('/api/products/quick-entry', requireAuth, (req, res) => {
  const processEntry = db.transaction((entryData) => {
    try {
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
    } catch (error) {
      throw error;
    }
  });
  
  try {
    const processedCount = processEntry(req.body);
    res.json({ success: true, processed: processedCount });
  } catch (error) {
    console.error('Error en entrada rápida:', error);
    res.status(500).json({ error: error.message || 'Error al procesar entrada de productos' });
  }
});

// ==================== REPORTES ====================

// Reporte resumen de ventas
app.get('/api/reports/sales', requireAuth, (req, res) => {
  try {
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
    
    // Totales generales
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(s.total), 0) as total,
        COUNT(s.id) as tickets,
        COALESCE(SUM(CASE WHEN pm.affects_cash = 1 THEN s.total ELSE 0 END), 0) as cash
      FROM sales s
      LEFT JOIN payment_methods pm ON s.payment_method_id = pm.id
      ${whereClause}
    `).get(...params);
    
    // Por método de pago
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
app.get('/api/reports/top-products', requireAuth, (req, res) => {
  try {
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
app.get('/api/reports/by-cashier', requireAuth, (req, res) => {
  try {
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
app.get('/api/reports/low-stock', requireAuth, (req, res) => {
  try {
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

// -------------------- REPORTES DETALLADOS (NUEVOS) --------------------

// Ventas detalladas (agrupado por producto)
// Columnas esperadas en frontend:
// CANTIDAD; PRODUCTO; CODIGO; COSTO UNITARIO FARMACIA; COSTO TOTAL FARMACIA; COSTO UNITARIO; COSTO TOTAL
app.get('/api/reports/detailed-sales', requireAuth, (req, res) => {
  try {
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
// Columnas esperadas en frontend: CANTIDAD; PRODUCTO; CODIGO
app.get('/api/reports/supplier-order', requireAuth, (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Fechas requeridas' });
    }

    if (!supplierId) {
      return res.status(400).json({ error: 'supplierId es requerido para Pedido Proveedor' });
    }

    const rows = db.prepare(`
      SELECT
        SUM(si.quantity) as quantity,
        p.name as product_name,
        p.barcode as barcode
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND p.supplier_id = ?
      GROUP BY p.id, p.name, p.barcode
      ORDER BY quantity DESC
    `).all(startDate, endDate, supplierId);

    res.json(rows.map(r => ({
      quantity: Number(r.quantity || 0),
      product_name: r.product_name,
      barcode: r.barcode
    })));
  } catch (error) {
    console.error('Error en /api/reports/supplier-order:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// Historial de ventas (por item; no agrupado)
// Columnas esperadas en frontend: CANTIDAD; PRODUCTO; CODIGO; COSTO TOTAL FARMACIA; COSTO TOTAL
app.get('/api/reports/sales-history', requireAuth, (req, res) => {
  try {
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

// ==================== MÚLTIPLES LÍNEAS / PROVEEDORES ====================

// Obtener líneas de un producto
app.get('/api/products/:productId/lines', requireAuth, (req, res) => {
  try {
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
app.post('/api/products/:productId/lines', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden agregar líneas' });
  }
  
  const { supplierId, isPrimary } = req.body;
  
  try {
    const result = db.prepare(`
      INSERT INTO product_lines (product_id, supplier_id, is_primary, created_at)
      VALUES (?, ?, ?, ?)
    `).run(req.params.productId, supplierId, isPrimary ? 1 : 0, new Date().toISOString());
    
    // Si es línea principal, actualizar el producto
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
app.delete('/api/products/:productId/lines/:lineId', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden eliminar líneas' });
  }
  
  try {
    db.prepare('DELETE FROM product_lines WHERE id = ? AND product_id = ?')
      .run(req.params.lineId, req.params.productId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar línea' });
  }
});

// ==================== PEDIDOS DE PROVEEDOR MEJORADOS ====================

// Obtener pedidos de proveedor
app.get('/api/supplier-orders', requireAuth, (req, res) => {
  try {
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

// Crear pedido de proveedor
app.post('/api/supplier-orders', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden crear pedidos' });
  }
  
  const { productId, supplierId, quantity } = req.body;
  
  if (!productId || !supplierId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  
  try {
    const result = db.prepare(`
      INSERT INTO supplier_orders (product_id, supplier_id, quantity, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(productId, supplierId, quantity, new Date().toISOString());
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido' });
  }
});

// Marcar como recibido
app.patch('/api/supplier-orders/:orderId/receive', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden marcar como recibido' });
  }
  
  const { receivedQuantity } = req.body;
  
  try {
    db.prepare(`
      UPDATE supplier_orders 
      SET received_quantity = ?, received = 1, status = 'received', received_at = ?
      WHERE id = ?
    `).run(receivedQuantity || 0, new Date().toISOString(), req.params.orderId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar como recibido' });
  }
});

// Duplicar pedido a otro proveedor
app.post('/api/supplier-orders/:orderId/duplicate', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden duplicar pedidos' });
  }
  
  const { newSupplierId } = req.body;
  
  try {
    const order = db.prepare('SELECT * FROM supplier_orders WHERE id = ?').get(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    const result = db.prepare(`
      INSERT INTO supplier_orders (product_id, supplier_id, quantity, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(order.product_id, newSupplierId, order.quantity, new Date().toISOString());
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error al duplicar pedido' });
  }
});

// Eliminar pedido
app.delete('/api/supplier-orders/:orderId', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden eliminar pedidos' });
  }
  
  try {
    db.prepare('DELETE FROM supplier_orders WHERE id = ?').run(req.params.orderId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
});

// Actualizar estado de pedido
app.patch('/api/supplier-orders/:orderId', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden actualizar pedidos' });
  }
  
  const { status } = req.body;
  
  try {
    db.prepare('UPDATE supplier_orders SET status = ? WHERE id = ?')
      .run(status, req.params.orderId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// Iniciar servidor
app.listen(config.server.port, config.server.host, () => {
  console.log(`✅ Servidor POS corriendo en http://${config.server.host}:${config.server.port}`);
  console.log(`🌍 Ambiente: ${config.env}`);
  console.log(`📂 Base de datos: ${config.database.path}`);
  console.log(`🚀 Listo para usar`);
  console.log(`📦 Sistema de importación masiva habilitado`);
  console.log(`🛍️ Módulo de punto de venta (POS) activo`);
  console.log(`📊 Módulo de reportes y analíticas activo`);
});
