-- Gestión de cajas: productos que se piden a proveedores por cajas
-- (se venden por pieza en el POS pero el pedido va en cajas).
ALTER TABLE "products" ADD COLUMN "sold_by_box" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "units_per_box" INTEGER;
ALTER TABLE "products" ADD COLUMN "box_remainder" INTEGER NOT NULL DEFAULT 0;

-- Los items del pedido guardan si la cantidad es en cajas y cuántas piezas trae cada caja.
ALTER TABLE "supplier_order_items" ADD COLUMN "is_box" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "supplier_order_items" ADD COLUMN "units_per_box" INTEGER;
