-- Historial de cajeros en pedidos: quién levantó el pedido (created_by_id)
-- y quién lo recibió (received_by_id). Ambos opcionales (ON DELETE SET NULL).
ALTER TABLE "supplier_orders" ADD COLUMN "created_by_id" INTEGER;
ALTER TABLE "supplier_orders" ADD COLUMN "received_by_id" INTEGER;

-- CreateIndex
CREATE INDEX "supplier_orders_created_by_id_idx" ON "supplier_orders"("created_by_id");

-- CreateIndex
CREATE INDEX "supplier_orders_received_by_id_idx" ON "supplier_orders"("received_by_id");
