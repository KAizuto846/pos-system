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
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id),
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
    
    -- Pedidos a proveedores
    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    
    -- Items de pedidos a proveedores
    CREATE TABLE IF NOT EXISTS supplier_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      received_quantity INTEGER DEFAULT 0,
      received_at TEXT,
      FOREIGN KEY (order_id) REFERENCES supplier_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Borradores de pedidos (Barra lateral / Memoria)
    CREATE TABLE IF NOT EXISTS supplier_order_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_id INTEGER,
      quantity INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    
    -- Índices para mejor rendimiento
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_department ON products(department_id);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
    CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment_method_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders(status);
    CREATE INDEX IF NOT EXISTS idx_supplier_order_items_order ON supplier_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_order_drafts_supplier ON supplier_order_drafts(supplier_id);
  `);
  
  // Ejecutar migraciones para bases de datos existentes
  runMigrations();
  
  console.log('✅ Base de datos inicializada');
  
  return db;
}

function runMigrations() {
  console.log('🔄 Verificando migraciones...');
  
  try {
    const paymentColumns = db.pragma('table_info(payment_methods)');
    if (!paymentColumns.some(col => col.name === 'affects_cash')) {
      db.exec('ALTER TABLE payment_methods ADD COLUMN affects_cash INTEGER DEFAULT 1');
    }
    
    const productColumns = db.pragma('table_info(products)');
    if (!productColumns.some(col => col.name === 'cost')) {
      db.exec('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0');
    }
    
    if (!productColumns.some(col => col.name === 'min_stock')) {
      db.exec('ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5');
    }

    // Nueva tabla si no existe
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_order_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        supplier_id INTEGER,
        quantity INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
    `);
    
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