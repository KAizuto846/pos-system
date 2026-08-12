-- Impuesto / recargo por horario: configuracion + historial de acciones.

CREATE TABLE "tax_rules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL DEFAULT '',
    "percentage" REAL NOT NULL,
    "apply_time" TEXT NOT NULL DEFAULT '20:00',
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "scope_value" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'schedule',
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "tax_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rule_id" INTEGER,
    "action" TEXT NOT NULL,
    "user_name" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
