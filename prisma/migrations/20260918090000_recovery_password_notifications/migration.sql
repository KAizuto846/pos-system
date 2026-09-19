-- recovery/pedido-contrasena (user/supplier) + tabla notifications + ajustes audit_logs/stock_alerts
-- Este drift nunca tenia migracion: las BDs creadas con el instalador (init-db)
-- nacian sin estas columnas y el primer registro de admin fallaba con 500
-- ("no se guardo nada" en PCs Windows frescas).
-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "password_reset_expires" DATETIME;
ALTER TABLE "suppliers" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "recovery_email" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_reset_expires" DATETIME;
ALTER TABLE "users" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "recovery_email" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "product_id" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL DEFAULT '',
    "user_role" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '{}',
    "before" TEXT NOT NULL DEFAULT '{}',
    "after" TEXT NOT NULL DEFAULT '{}',
    "ip" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_audit_logs" ("action", "created_at", "description", "details", "entity", "entity_id", "id", "ip", "user_id", "user_name", "user_role") SELECT "action", "created_at", "description", "details", "entity", "entity_id", "id", "ip", "user_id", "user_name", "user_role" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "new_audit_logs" RENAME TO "audit_logs";
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");
CREATE TABLE "new_stock_alerts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity_sold" INTEGER NOT NULL,
    "stock_before" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "shortage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acked_by" INTEGER,
    "acked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_alerts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_stock_alerts" ("acked_at", "acked_by", "created_at", "id", "product_id", "product_name", "quantity_sold", "sale_id", "shortage", "status", "stock_after", "stock_before") SELECT "acked_at", "acked_by", "created_at", "id", "product_id", "product_name", "quantity_sold", "sale_id", "shortage", "status", "stock_after", "stock_before" FROM "stock_alerts";
DROP TABLE "stock_alerts";
ALTER TABLE "new_stock_alerts" RENAME TO "stock_alerts";
CREATE INDEX "stock_alerts_status_idx" ON "stock_alerts"("status");
CREATE INDEX "stock_alerts_sale_id_idx" ON "stock_alerts"("sale_id");
CREATE INDEX "stock_alerts_product_id_idx" ON "stock_alerts"("product_id");
CREATE TABLE "new_supplier_orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "sent_at" DATETIME,
    "created_by_id" INTEGER,
    "received_by_id" INTEGER,
    CONSTRAINT "supplier_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "supplier_orders_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_supplier_orders" ("created_at", "created_by_id", "id", "notes", "received_by_id", "sent_at", "status", "supplier_id", "updated_at") SELECT "created_at", "created_by_id", "id", "notes", "received_by_id", "sent_at", "status", "supplier_id", "updated_at" FROM "supplier_orders";
DROP TABLE "supplier_orders";
ALTER TABLE "new_supplier_orders" RENAME TO "supplier_orders";
CREATE INDEX "supplier_orders_supplier_id_idx" ON "supplier_orders"("supplier_id");
CREATE INDEX "supplier_orders_status_idx" ON "supplier_orders"("status");
CREATE INDEX "supplier_orders_created_by_id_idx" ON "supplier_orders"("created_by_id");
CREATE INDEX "supplier_orders_received_by_id_idx" ON "supplier_orders"("received_by_id");
CREATE TABLE "new_tax_rules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT '',
    "percentage" REAL NOT NULL,
    "apply_time" TEXT NOT NULL DEFAULT '20:00',
    "end_time" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "scope_value" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'schedule',
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_tax_rules" ("active", "apply_time", "end_time", "id", "name", "percentage", "scope", "scope_value", "status", "updated_at") SELECT "active", "apply_time", "end_time", "id", "name", "percentage", "scope", "scope_value", "status", "updated_at" FROM "tax_rules";
DROP TABLE "tax_rules";
ALTER TABLE "new_tax_rules" RENAME TO "tax_rules";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- CreateIndex
CREATE INDEX "notifications_product_id_idx" ON "notifications"("product_id");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_password_reset_token_key" ON "suppliers"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");

