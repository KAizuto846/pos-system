-- CreateIndex
CREATE INDEX "product_lines_supplier_id_product_id_idx" ON "product_lines"("supplier_id", "product_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_sale_id_idx" ON "sale_items"("product_id", "sale_id");

-- CreateIndex
CREATE INDEX "refunds_sale_id_product_id_idx" ON "refunds"("sale_id", "product_id");

-- CreateIndex
CREATE INDEX "cash_entries_type_category_idx" ON "cash_entries"("type", "category");

-- CreateIndex
CREATE INDEX "sales_user_id_created_at_idx" ON "sales"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_log_synced_timestamp_idx" ON "sync_log"("synced", "timestamp");
