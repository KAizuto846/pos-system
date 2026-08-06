-- CreateTable
CREATE TABLE "customers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "fingerprint_hash" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "total_spent" REAL NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "last_purchase_at" DATETIME,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_products" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "loyalty_discount" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "department_id" INTEGER,
    "supplier_id" INTEGER,
    CONSTRAINT "products_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" ("active", "barcode", "cost", "created_at", "department_id", "id", "min_stock", "name", "price", "stock", "supplier_id", "updated_at") SELECT "active", "barcode", "cost", "created_at", "department_id", "id", "min_stock", "name", "price", "stock", "supplier_id", "updated_at" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE INDEX "products_barcode_idx" ON "products"("barcode");
CREATE INDEX "products_department_id_idx" ON "products"("department_id");
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "products_created_at_idx" ON "products"("created_at");
CREATE TABLE "new_sales" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "total" REAL NOT NULL,
    "discount_total" REAL NOT NULL DEFAULT 0,
    "payment_method_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sales" ("created_at", "id", "payment_method_id", "total", "user_id") SELECT "created_at", "id", "payment_method_id", "total", "user_id" FROM "sales";
DROP TABLE "sales";
ALTER TABLE "new_sales" RENAME TO "sales";
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");
CREATE INDEX "sales_user_id_idx" ON "sales"("user_id");
CREATE INDEX "sales_payment_method_id_idx" ON "sales"("payment_method_id");
CREATE INDEX "sales_total_idx" ON "sales"("total");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_fingerprint_hash_idx" ON "customers"("fingerprint_hash");

-- CreateIndex
CREATE INDEX "customers_tier_idx" ON "customers"("tier");
