/**
 * DB initializer — runs at first launch to create SQLite tables.
 * Uses @prisma/client (available in standalone) to execute raw SQL.
 * Reads migration files from the prisma/ directory bundled in standalone.
 */
const path = require('path');
const fs = require('fs');

// Resolve standalone dir: in packaged app, it's at resources/standalone
// In dev, it's at .next/standalone
function findServerDir() {
  const candidates = [
    path.join(__dirname, '..', 'standalone'),        // packaged: resources/app/electron/../standalone
    path.join(__dirname, '..', '..', 'standalone'),  // packaged alt
    path.join(__dirname, '..', '.next', 'standalone'), // dev
    path.join(process.resourcesPath || '', 'standalone'), // packaged via resourcesPath (Electron only)
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'server.js'))) {
      return c;
    }
  }
  return candidates[0]; // fallback to first candidate
}

// If SERVER_DIR passed as 3rd arg (from main.js spawn), use it
const SERVER_DIR = process.argv[3] || findServerDir();

if (!fs.existsSync(path.join(SERVER_DIR, 'server.js'))) {
  console.error('[init-db] Could not find standalone server dir. Tried:', SERVER_DIR);
  process.exit(1);
}

async function initDB(dbUrl) {
  // Dynamically require Prisma Client from standalone
  const { PrismaClient } = require(path.join(SERVER_DIR, 'node_modules', '@prisma', 'client'));
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  // Helper: use queryRawUnsafe for all SQLite statements (PRAGMAs return results)
  async function execSQL(stmt) {
    try {
      await prisma.$queryRawUnsafe(stmt);
    } catch (e) {
      const msg = e.message || '';
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate column name') ||
        msg.includes('no such table')
      ) {
        console.log('[init-db] Skipping (harmless):', msg.substring(0, 80));
      } else {
        console.error('[init-db] Statement error:', msg, '\nSQL:', stmt.substring(0, 100));
      }
    }
  }

  try {
    // Create migration tracking table
    await execSQL(
      `CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" TEXT NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL, "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    );

    const migrationDir = path.join(SERVER_DIR, 'prisma', 'migrations');
    if (!fs.existsSync(migrationDir)) {
      console.log('[init-db] No migrations directory found, using fallback');
      return applyFallbackTables();
    }

    const allMigrations = fs.readdirSync(migrationDir)
      .filter(f => f !== 'migration_lock.toml' && f !== '_prisma_migrations')
      .sort();

    if (allMigrations.length === 0) {
      console.log('[init-db] No migration files found');
      return true;
    }

    // Get already-applied migration ids
    let appliedRows = [];
    try {
      appliedRows = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "_prisma_migrations" ORDER BY "id"`
      );
    } catch (e) {
      // Table doesn't exist yet, no migrations applied
    }
    const appliedIds = new Set(appliedRows.map(r => r.id));

    let appliedCount = 0;

    for (const mig of allMigrations) {
      if (appliedIds.has(mig)) {
        console.log('[init-db] Migration already applied:', mig);
        continue;
      }

      const sqlFile = path.join(migrationDir, mig, 'migration.sql');
      if (!fs.existsSync(sqlFile)) {
        console.warn('[init-db] Missing migration SQL for:', mig);
        continue;
      }

      const sql = fs.readFileSync(sqlFile, 'utf8');
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

      for (const stmt of statements) {
        await execSQL(stmt);
      }

      // Record migration as applied
      await prisma.$queryRawUnsafe(
        `INSERT INTO "_prisma_migrations" ("id", "checksum") VALUES ('${mig}', 'manual')`
      );

      console.log('[init-db] Applied migration:', mig);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log('[init-db] Database is up to date');
    }

    return true;
  } catch (e) {
    console.error('[init-db] Error:', e.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }

  // ── Fallback: create tables manually ──
  async function applyFallbackTables() {
    const createTables = [
      `CREATE TABLE IF NOT EXISTS "users" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "username" TEXT NOT NULL, "password" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT '', "role" TEXT NOT NULL DEFAULT 'CASHIER',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username")`,
      `CREATE TABLE IF NOT EXISTS "accounts" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "user_id" INTEGER NOT NULL, "type" TEXT NOT NULL,
        "provider" TEXT NOT NULL, "provider_account_id" TEXT NOT NULL,
        "refresh_token" TEXT, "access_token" TEXT, "expires_at" INTEGER,
        "token_type" TEXT, "scope" TEXT, "id_token" TEXT, "session_state" TEXT,
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id")`,
      `CREATE TABLE IF NOT EXISTS "sessions" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "session_token" TEXT NOT NULL, "user_id" INTEGER NOT NULL,
        "expires" DATETIME NOT NULL,
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_token_key" ON "sessions"("session_token")`,
      `CREATE TABLE IF NOT EXISTS "verification_tokens" (
        "identifier" TEXT NOT NULL, "token" TEXT NOT NULL,
        "expires" DATETIME NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token")`,
      `CREATE TABLE IF NOT EXISTS "departments" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL, "contact" TEXT NOT NULL DEFAULT '',
        "phone" TEXT NOT NULL DEFAULT '', "email" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '', "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "payment_methods" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL, "affects_cash" BOOLEAN NOT NULL DEFAULT true,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "products" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL, "barcode" TEXT NOT NULL DEFAULT '',
        "price" REAL NOT NULL, "cost" REAL NOT NULL DEFAULT 0,
        "stock" INTEGER NOT NULL DEFAULT 0, "min_stock" INTEGER NOT NULL DEFAULT 5,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "loyalty_discount" BOOLEAN NOT NULL DEFAULT false,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL,
        "department_id" INTEGER, "supplier_id" INTEGER,
        FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL,
        FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products"("barcode")`,
      `CREATE TABLE IF NOT EXISTS "customers" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL, "fingerprint_hash" TEXT,
        "phone" TEXT NOT NULL DEFAULT '', "email" TEXT NOT NULL DEFAULT '',
        "total_spent" REAL NOT NULL DEFAULT 0,
        "purchase_count" INTEGER NOT NULL DEFAULT 0,
        "last_purchase_at" DATETIME, "tier" TEXT NOT NULL DEFAULT 'bronze',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "sales" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "total" REAL NOT NULL, "discount_total" REAL NOT NULL DEFAULT 0,
        "payment_method_id" INTEGER, "user_id" INTEGER NOT NULL,
        "customer_id" INTEGER,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL,
        FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS "sales_created_at_idx" ON "sales"("created_at")`,
      `CREATE TABLE IF NOT EXISTS "sale_items" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "sale_id" INTEGER NOT NULL, "product_id" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL, "price" REAL NOT NULL,
        FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "supplier_orders" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "supplier_id" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
        "notes" TEXT NOT NULL DEFAULT '',
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL, "sent_at" DATETIME,
        FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "supplier_order_items" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "supplier_order_id" INTEGER NOT NULL, "product_id" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL, "received_quantity" INTEGER NOT NULL DEFAULT 0,
        "received" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT NOT NULL DEFAULT '',
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL,
        FOREIGN KEY ("supplier_order_id") REFERENCES "supplier_orders"("id") ON DELETE CASCADE,
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "product_lines" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "product_id" INTEGER NOT NULL, "supplier_id" INTEGER NOT NULL,
        "is_primary" BOOLEAN NOT NULL DEFAULT false,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "cash_entries" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "type" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'other',
        "amount" REAL NOT NULL, "description" TEXT NOT NULL DEFAULT '',
        "sale_id" INTEGER, "payment_method_id" INTEGER,
        "user_id" INTEGER NOT NULL, "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL,
        FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL,
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "refunds" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "sale_id" INTEGER NOT NULL, "product_id" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL, "amount" REAL NOT NULL,
        "reason" TEXT NOT NULL DEFAULT '', "user_id" INTEGER NOT NULL,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        FOREIGN KEY ("product_id") REFERENCES "products"("id"),
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "shift_reports" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "user_id" INTEGER NOT NULL, "start_date" DATETIME NOT NULL,
        "end_date" DATETIME NOT NULL, "total_sales" INTEGER NOT NULL DEFAULT 0,
        "total_amount" REAL NOT NULL DEFAULT 0, "total_refunds" INTEGER NOT NULL DEFAULT 0,
        "refund_amount" REAL NOT NULL DEFAULT 0, "net_amount" REAL NOT NULL DEFAULT 0,
        "by_payment_method" TEXT NOT NULL DEFAULT '{}', "notes" TEXT NOT NULL DEFAULT '',
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )`,
      `CREATE TABLE IF NOT EXISTS "sync_log" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "device_id" TEXT NOT NULL, "operation" TEXT NOT NULL,
        "entity" TEXT NOT NULL, "entity_id" INTEGER NOT NULL,
        "data" TEXT NOT NULL, "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "synced" BOOLEAN NOT NULL DEFAULT false,
        "sync_version" INTEGER NOT NULL DEFAULT 0
      )`,
    ];

    for (const stmt of createTables) {
      await execSQL(stmt);
    }
    console.log('[init-db] Created tables from fallback schema');
  }
}

module.exports = { initDB };

// Run directly if called as script
if (require.main === module) {
  const dbUrl = process.argv[2] || 'file:./prisma/dev.db';
  initDB(dbUrl).then(ok => process.exit(ok ? 0 : 1));
}
