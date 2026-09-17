-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shift_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "total_amount" REAL NOT NULL DEFAULT 0,
    "total_cost" REAL NOT NULL DEFAULT 0,
    "total_refunds" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" REAL NOT NULL DEFAULT 0,
    "net_amount" REAL NOT NULL DEFAULT 0,
    "by_payment_method" TEXT NOT NULL DEFAULT '{}',
    "details" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_shift_reports" ("by_payment_method", "created_at", "end_date", "id", "net_amount", "notes", "refund_amount", "start_date", "total_amount", "total_refunds", "total_sales", "user_id") SELECT "by_payment_method", "created_at", "end_date", "id", "net_amount", "notes", "refund_amount", "start_date", "total_amount", "total_refunds", "total_sales", "user_id" FROM "shift_reports";
DROP TABLE "shift_reports";
ALTER TABLE "new_shift_reports" RENAME TO "shift_reports";
CREATE INDEX "shift_reports_user_id_idx" ON "shift_reports"("user_id");
CREATE INDEX "shift_reports_created_at_idx" ON "shift_reports"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

