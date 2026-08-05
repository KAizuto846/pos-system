-- AlterTable
ALTER TABLE "product_lines" ADD COLUMN "supplier_price" REAL;

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sale_id" INTEGER,
    "payment_method_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_entries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cash_entries_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cash_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refunds_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refunds_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shift_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "total_amount" REAL NOT NULL DEFAULT 0,
    "total_refunds" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" REAL NOT NULL DEFAULT 0,
    "net_amount" REAL NOT NULL DEFAULT 0,
    "by_payment_method" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "device_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "cash_entries_type_idx" ON "cash_entries"("type");

-- CreateIndex
CREATE INDEX "cash_entries_category_idx" ON "cash_entries"("category");

-- CreateIndex
CREATE INDEX "cash_entries_recorded_at_idx" ON "cash_entries"("recorded_at");

-- CreateIndex
CREATE INDEX "cash_entries_payment_method_id_idx" ON "cash_entries"("payment_method_id");

-- CreateIndex
CREATE INDEX "cash_entries_user_id_idx" ON "cash_entries"("user_id");

-- CreateIndex
CREATE INDEX "refunds_sale_id_idx" ON "refunds"("sale_id");

-- CreateIndex
CREATE INDEX "refunds_product_id_idx" ON "refunds"("product_id");

-- CreateIndex
CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at");

-- CreateIndex
CREATE INDEX "shift_reports_user_id_idx" ON "shift_reports"("user_id");

-- CreateIndex
CREATE INDEX "shift_reports_created_at_idx" ON "shift_reports"("created_at");

-- CreateIndex
CREATE INDEX "sync_log_device_id_synced_idx" ON "sync_log"("device_id", "synced");

-- CreateIndex
CREATE INDEX "sync_log_entity_entity_id_idx" ON "sync_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "sync_log_timestamp_idx" ON "sync_log"("timestamp");

-- CreateIndex
CREATE INDEX "departments_name_idx" ON "departments"("name");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_product_id_idx" ON "sale_items"("sale_id", "product_id");

-- CreateIndex
CREATE INDEX "sales_total_idx" ON "sales"("total");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
