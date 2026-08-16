// Sistema de respaldos automáticos.
// Exporta TODAS las tablas de la base de datos a un archivo JSON y lo guarda
// en la ruta configurada. Configurable: frecuencia (horas), retención (días)
// y carpeta de destino. Config persistida en AppSetting (key: backupConfig).

import { prisma } from "@/lib/db";
import * as fs from "node:fs";
import * as path from "node:path";

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number; // cada cuántas horas se ejecuta
  retentionDays: number; // cuántos días se conservan los archivos
  folder: string; // ruta donde se guardan los archivos
  lastRunAt?: string | null; // última vez que se ejecutó
  lastResult?: string | null; // resumen del último respaldo
}

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  intervalHours: 24,
  retentionDays: 30,
  folder: "",
  lastRunAt: null,
  lastResult: null,
};

// Ruta por defecto: carpeta "backups" junto a la base de datos (userData en
// Electron, o la carpeta del server en web).
function defaultFolder(): string {
  const userData = process.env.POS_USER_DATA;
  if (userData) return path.join(userData, "backups");
  // fallback: directorio de trabajo del servidor standalone
  return path.join(process.cwd(), "backups");
}

export async function getBackupConfig(): Promise<BackupConfig> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "backupConfig" } });
    if (!row) return { ...DEFAULT_CONFIG, folder: defaultFolder() };
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_CONFIG, ...parsed, folder: parsed.folder || defaultFolder() };
  } catch {
    return { ...DEFAULT_CONFIG, folder: defaultFolder() };
  }
}

export async function saveBackupConfig(cfg: BackupConfig): Promise<BackupConfig> {
  const merged = { ...DEFAULT_CONFIG, ...cfg, folder: cfg.folder || defaultFolder() };
  await prisma.appSetting.upsert({
    where: { key: "backupConfig" },
    create: { key: "backupConfig", value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  return merged;
}

// Exporta todas las tablas de la base a un objeto plano.
async function dumpAllData(): Promise<Record<string, unknown[]>> {
  const [users, departments, suppliers, paymentMethods, products, batches, customers,
    productLines, sales, saleItems, supplierOrders, supplierOrderItems, cashEntries,
    refunds, shiftReports, taxRules, taxLogs, wishlistItems, deliveryNotices,
    piecesLog, stockAlerts] = await Promise.all([
    prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true, createdAt: true } }),
    prisma.department.findMany(),
    prisma.supplier.findMany(),
    prisma.paymentMethod.findMany(),
    prisma.product.findMany(),
    prisma.productBatch.findMany(),
    prisma.customer.findMany(),
    prisma.productLine.findMany(),
    prisma.sale.findMany(),
    prisma.saleItem.findMany(),
    prisma.supplierOrder.findMany(),
    prisma.supplierOrderItem.findMany(),
    prisma.cashEntry.findMany(),
    prisma.refund.findMany(),
    prisma.shiftReport.findMany(),
    prisma.taxRule.findMany(),
    prisma.taxLog.findMany(),
    prisma.customerWishlistItem.findMany(),
    prisma.deliveryNotice.findMany(),
    prisma.piecesLog.findMany(),
    prisma.stockAlert.findMany(),
  ]);

  return {
    users,
    departments,
    suppliers,
    paymentMethods,
    products,
    batches,
    customers,
    productLines,
    sales,
    saleItems,
    supplierOrders,
    supplierOrderItems,
    cashEntries,
    refunds,
    shiftReports,
    taxRules,
    taxLogs,
    wishlistItems,
    deliveryNotices,
    piecesLog,
    stockAlerts,
  };
}

// Borra los archivos de respaldo más antiguos que retentionDays.
function cleanOldBackups(folder: string, retentionDays: number): number {
  if (retentionDays <= 0) return 0;
  let removed = 0;
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(folder).filter((f) => f.startsWith("backup-") && f.endsWith(".json"));
    for (const f of files) {
      const full = path.join(folder, f);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // carpeta no existe todavía
  }
  return removed;
}

// Ejecuta un respaldo completo. Devuelve un resumen.
export async function runBackup(cfg?: BackupConfig): Promise<{ ok: boolean; file?: string; error?: string }> {
  const config = cfg || (await getBackupConfig());
  const folder = config.folder || defaultFolder();

  try {
    fs.mkdirSync(folder, { recursive: true });

    const data = await dumpAllData();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup-${stamp}.json`;
    const fullPath = path.join(folder, filename);

    const payload = {
      app: "pos-system",
      backupVersion: "1.0",
      createdAt: new Date().toISOString(),
      data,
    };

    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
    const removed = cleanOldBackups(folder, config.retentionDays);

    const sizeKb = Math.round(fs.statSync(fullPath).size / 1024);
    const counts = Object.entries(data).map(([k, v]) => `${k}:${v.length}`).join(", ");
    const result = `Respaldo OK (${sizeKb} KB) · ${counts} · Limpieza: ${removed} archivo(s) eliminado(s)`;

    await saveBackupConfig({ ...config, lastRunAt: new Date().toISOString(), lastResult: result });
    return { ok: true, file: fullPath };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Error desconocido";
    await saveBackupConfig({ ...config, lastRunAt: new Date().toISOString(), lastResult: `Error: ${error}` });
    return { ok: false, error };
  }
}

// Verifica si toca ejecutar el respaldo según la configuración.
export function shouldRunBackup(config: BackupConfig, now = Date.now()): boolean {
  if (!config.enabled) return false;
  if (config.intervalHours <= 0) return false;
  if (!config.lastRunAt) return true;
  const last = new Date(config.lastRunAt).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= config.intervalHours * 60 * 60 * 1000;
}

// Lista los archivos de respaldo existentes.
export function listBackupFiles(folder?: string): Array<{ name: string; size: number; mtime: string }> {
  const dir = folder || defaultFolder();
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}
