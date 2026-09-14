-- syncVersion pasa a BigInt (64-bit) para admitir Date.now() (~1.78e12).
-- Prisma valida los valores contra el tipo declarado de la columna: con INTEGER
-- (int32) rechaza valores > 2147483647 con P2023. La columna debe ser BIGINT.
-- SQLite no soporta ALTER COLUMN: se recrea la tabla.

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_sync_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "device_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" BIGINT NOT NULL DEFAULT 0
);

INSERT INTO "new_sync_log" ("id","device_id","operation","entity","entity_id","data","timestamp","synced","sync_version")
  SELECT "id","device_id","operation","entity","entity_id","data","timestamp","synced","sync_version" FROM "sync_log";

DROP TABLE "sync_log";
ALTER TABLE "new_sync_log" RENAME TO "sync_log";

CREATE INDEX "sync_log_synced_timestamp_idx" ON "sync_log"("synced","timestamp");
CREATE INDEX "sync_log_timestamp_idx" ON "sync_log"("timestamp");
CREATE INDEX "sync_log_entity_entity_id_idx" ON "sync_log"("entity","entity_id");
CREATE INDEX "sync_log_device_id_synced_idx" ON "sync_log"("device_id","synced");

PRAGMA foreign_keys=ON;
