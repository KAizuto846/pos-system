-- CreateTable
CREATE TABLE "user_wishlist_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "delivery_notices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmed_by" INTEGER,
    "confirmed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_notices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supplier_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "delivery_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pieces_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "box_product_id" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'generated',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pieces_log_box_product_id_fkey" FOREIGN KEY ("box_product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "pieces_per_unit" INTEGER,
    "pieces_tracked" BOOLEAN NOT NULL DEFAULT false,
    "piece_of_product_id" INTEGER,
    CONSTRAINT "products_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "products_piece_of_product_id_fkey" FOREIGN KEY ("piece_of_product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" ("active", "barcode", "cost", "created_at", "department_id", "id", "loyalty_discount", "min_stock", "name", "price", "stock", "supplier_id", "updated_at") SELECT "active", "barcode", "cost", "created_at", "department_id", "id", "loyalty_discount", "min_stock", "name", "price", "stock", "supplier_id", "updated_at" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE INDEX "products_barcode_idx" ON "products"("barcode");
CREATE INDEX "products_department_id_idx" ON "products"("department_id");
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "products_created_at_idx" ON "products"("created_at");
CREATE INDEX "products_piece_of_product_id_idx" ON "products"("piece_of_product_id");
CREATE TABLE "new_supplier_order_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier_order_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "product_name" TEXT NOT NULL DEFAULT '',
    "product_barcode" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "extra" BOOLEAN NOT NULL DEFAULT false,
    "cost_price" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "supplier_order_items_supplier_order_id_fkey" FOREIGN KEY ("supplier_order_id") REFERENCES "supplier_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supplier_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_supplier_order_items" ("cost_price", "created_at", "extra", "id", "notes", "product_id", "quantity", "received", "received_quantity", "supplier_order_id", "updated_at") SELECT "cost_price", "created_at", "extra", "id", "notes", "product_id", "quantity", "received", "received_quantity", "supplier_order_id", "updated_at" FROM "supplier_order_items";
DROP TABLE "supplier_order_items";
ALTER TABLE "new_supplier_order_items" RENAME TO "supplier_order_items";
CREATE INDEX "supplier_order_items_supplier_order_id_idx" ON "supplier_order_items"("supplier_order_id");
CREATE INDEX "supplier_order_items_product_id_idx" ON "supplier_order_items"("product_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "user_wishlist_items_user_id_idx" ON "user_wishlist_items"("user_id");

-- CreateIndex
CREATE INDEX "user_wishlist_items_product_id_idx" ON "user_wishlist_items"("product_id");

-- CreateIndex
CREATE INDEX "delivery_notices_status_idx" ON "delivery_notices"("status");

-- CreateIndex
CREATE INDEX "delivery_notices_user_id_idx" ON "delivery_notices"("user_id");

-- CreateIndex
CREATE INDEX "delivery_notices_order_id_idx" ON "delivery_notices"("order_id");

-- CreateIndex
CREATE INDEX "pieces_log_box_product_id_idx" ON "pieces_log"("box_product_id");

-- CreateIndex
CREATE INDEX "pieces_log_created_at_idx" ON "pieces_log"("created_at");

