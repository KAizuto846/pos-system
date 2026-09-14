-- Mover la lista de medicamentos (wishlist) y los avisos de llegada de
-- "usuarios del sistema" a "clientes": la lista de medicamentos es de los
-- clientes del negocio, no de los usuarios que operan el POS.
--
-- Backfill: se mapean los datos existentes por coincidencia de nombre entre
-- users y customers (la "persona" registrada como usuario tenia su nombre real;
-- en el programa de fidelidad los clientes se registran por nombre). Los
-- registros sin cliente correspondiente se descartan.

-- CreateTable
CREATE TABLE "customer_wishlist_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_wishlist_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Backfill: user_wishlist_items -> customers por nombre del usuario
INSERT INTO "customer_wishlist_items" ("id", "customer_id", "product_id", "name", "quantity", "notes", "created_at")
SELECT w."id", c."id", w."product_id", w."name", w."quantity", w."notes", w."created_at"
FROM "user_wishlist_items" w
JOIN "users" u ON u."id" = w."user_id"
JOIN "customers" c ON c."name" = u."name";

-- DropTable
DROP TABLE "user_wishlist_items";

-- RedefineTables (delivery_notices: user_id -> customer_id)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_delivery_notices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmed_by" INTEGER,
    "confirmed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_notices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supplier_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "delivery_notices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_delivery_notices" ("id", "order_id", "customer_id", "items", "status", "confirmed_by", "confirmed_at", "created_at")
SELECT dn."id", dn."order_id", c."id", dn."items", dn."status", dn."confirmed_by", dn."confirmed_at", dn."created_at"
FROM "delivery_notices" dn
JOIN "users" u ON u."id" = dn."user_id"
JOIN "customers" c ON c."name" = u."name";
DROP TABLE "delivery_notices";
ALTER TABLE "new_delivery_notices" RENAME TO "delivery_notices";
CREATE INDEX "delivery_notices_status_idx" ON "delivery_notices"("status");
CREATE INDEX "delivery_notices_customer_id_idx" ON "delivery_notices"("customer_id");
CREATE INDEX "delivery_notices_order_id_idx" ON "delivery_notices"("order_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "customer_wishlist_items_customer_id_idx" ON "customer_wishlist_items"("customer_id");

-- CreateIndex
CREATE INDEX "customer_wishlist_items_product_id_idx" ON "customer_wishlist_items"("product_id");