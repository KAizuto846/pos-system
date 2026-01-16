const Database = require('better-sqlite3');
const path = require('path');

let db;

function initDatabase() {
  db = new Database(path.join(__dirname, 'pos.db'));
  
  // Crear todas las tablas
  db.exec(`
    -- Usuarios
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    
    -- Formas de pago
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      affects_cash INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    
    -- Proveedores (Líneas)
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    
    -- Departamentos
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    
    -- Productos
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      department_id INTEGER,
      supplier_id INTEGER,
      primary_line_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (primary_line_id) REFERENCES suppliers(id)
    );
    
    -- Líneas de productos (relación muchos a muchos)
    CREATE TABLE IF NOT EXISTS product_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(product_id, supplier_id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    
    -- Pedidos de proveedor mejorados
    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      received_quantity INTEGER DEFAULT 0,
      received INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      received_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    
    -- Ventas
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      payment_method_id INTEGER,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
    );
    
    -- Detalles de venta
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    -- Índices para mejor rendimiento
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_department ON products(department_id);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_products_primary_line ON products(primary_line_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_product_lines_product ON product_lines(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_lines_supplier ON product_lines(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_orders_product ON supplier_orders(product_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON supplier_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders(status);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
    CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment_method_id);
  `);
  
  // Ejecutar migraciones para bases de datos existentes
  runMigrations();
  
  console.log('✅ Base de datos inicializada');
  console.log('✅ Tablas creadas: users, payment_methods, suppliers, departments, products, sales, sale_items');
  
  return db;
}

function runMigrations() {
  console.log('🔄 Verificando migraciones...');
  
  try {
    // Migración 1: Verificar columna affects_cash en payment_methods
    const paymentColumns = db.pragma('table_info(payment_methods)');
    const hasAffectsCash = paymentColumns.some(col => col.name === 'affects_cash');
    
    if (!hasAffectsCash) {
      console.log('⚙️  Agregando columna affects_cash a payment_methods...');
      try {
        db.exec('ALTER TABLE payment_methods ADD COLUMN affects_cash INTEGER DEFAULT 1');
        console.log('✅ Migración completada: affects_cash');
      } catch (e) {
        console.log('ℹ️  Columna affects_cash ya existe');
      }
    }
    
    // Migración 2: Verificar columna cost en products
    let productColumns = db.pragma('table_info(products)');
    let hasCost = productColumns.some(col => col.name === 'cost');
    
    if (!hasCost) {
      console.log('⚙️  Agregando columna cost a products...');
      try {
        db.exec('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0');
        console.log('✅ Migración completada: cost');
      } catch (e) {
        console.log('ℹ️  Columna cost ya existe');
      }
    }
    
    // Migración 3: Verificar columna min_stock en products
    productColumns = db.pragma('table_info(products)');
    let hasMinStock = productColumns.some(col => col.name === 'min_stock');
    
    if (!hasMinStock) {
      console.log('⚙️  Agregando columna min_stock a products...');
      try {
        db.exec('ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5');
        console.log('✅ Migración completada: min_stock');
      } catch (e) {
        console.log('ℹ️  Columna min_stock ya existe');
      }
    }
    
    // Migración 4: Verificar columna primary_line_id en products
    productColumns = db.pragma('table_info(products)');
    let hasPrimaryLineId = productColumns.some(col => col.name === 'primary_line_id');
    
    if (!hasPrimaryLineId) {
      console.log('⚙️  Agregando columna primary_line_id a products...');
      try {
        db.exec('ALTER TABLE products ADD COLUMN primary_line_id INTEGER');
        console.log('✅ Migración completada: primary_line_id');
      } catch (e) {
        console.log('ℹ️  Columna primary_line_id ya existe');
      }
    }
    
    // Migración 5: Crear tabla product_lines si no existe
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          supplier_id INTEGER NOT NULL,
          is_primary INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          UNIQUE(product_id, supplier_id),
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )
      `);
      console.log('✅ Tabla product_lines creada o verificada');
    } catch (e) {
      console.log('ℹ️  Tabla product_lines ya existe');
    }
    
    // Migración 6: Crear tabla supplier_orders si no existe
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS supplier_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          supplier_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          received_quantity INTEGER DEFAULT 0,
          received INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          created_at TEXT NOT NULL,
          received_at TEXT,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )
      `);
      console.log('✅ Tabla supplier_orders creada o verificada');
    } catch (e) {
      console.log('ℹ️  Tabla supplier_orders ya existe');
    }
    
    console.log('✅ Todas las migraciones completadas');
  } catch (error) {
    console.error('❌ Error en migraciones:', error.message);
  }
}

function getDB() {
  if (!db) {
    throw new Error('Base de datos no inicializada');
  }
  return db;
}

module.exports = { initDatabase, getDB };