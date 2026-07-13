/**
 * DB initializer — runs at first launch to create SQLite tables.
 * Uses @prisma/client (available in standalone) to execute raw SQL.
 * Reads migration files from the prisma/ directory bundled in standalone.
 */
const path = require('path');
const fs = require('fs');

const SERVER_DIR = path.join(__dirname, '..', 'standalone');

async function initDB(dbUrl) {
  // Dynamically require Prisma Client from standalone
  const { PrismaClient } = require(path.join(SERVER_DIR, 'node_modules', '@prisma', 'client'));
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    // Check if tables already exist
    const result = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    if (result.length > 0) {
      console.log('[init-db] Tables already exist, skipping');
      return true;
    }

    console.log('[init-db] Creating tables...');

    // Read migration SQL
    const migrationDir = path.join(SERVER_DIR, 'prisma', 'migrations');
    if (fs.existsSync(migrationDir)) {
      const migrations = fs.readdirSync(migrationDir).filter(f => f !== 'migration_lock.toml').sort();
      for (const mig of migrations) {
        const sqlFile = path.join(migrationDir, mig, 'migration.sql');
        if (fs.existsSync(sqlFile)) {
          const sql = fs.readFileSync(sqlFile, 'utf8');
          // Split by semicolons and execute each statement
          const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            try {
              await prisma.$executeRawUnsafe(stmt);
            } catch (e) {
              // Ignore "already exists" errors
              if (!e.message.includes('already exists')) {
                console.error('[init-db] Statement error:', e.message, '\nSQL:', stmt.substring(0, 100));
              }
            }
          }
          console.log('[init-db] Applied migration:', mig);
        }
      }
    } else {
      // Fallback: create tables manually from the known schema
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
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          "department_id" INTEGER, "supplier_id" INTEGER,
          FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL,
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products"("barcode")`,
        `CREATE TABLE IF NOT EXISTS "sales" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "total" REAL NOT NULL, "payment_method_id" INTEGER,
          "user_id" INTEGER NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL,
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
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
      ];

      for (const stmt of createTables) {
        await prisma.$executeRawUnsafe(stmt);
      }
      console.log('[init-db] Created tables from fallback schema');
    }

    return true;
  } catch (e) {
    console.error('[init-db] Error:', e.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { initDB };

// Run directly if called as script
if (require.main === module) {
  const dbUrl = process.argv[2] || 'file:./prisma/dev.db';
  initDB(dbUrl).then(ok => process.exit(ok ? 0 : 1));
}
