-- CreateTable
CREATE TABLE "product_batches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" DATETIME,
    "cost_price" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "product_batches_product_id_idx" ON "product_batches"("product_id");

-- CreateIndex
CREATE INDEX "product_batches_expires_at_idx" ON "product_batches"("expires_at");

-- AlterTable
ALTER TABLE "supplier_order_items" ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "supplier_order_items" ADD COLUMN "cost_price" REAL;
