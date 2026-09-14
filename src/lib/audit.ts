import { prisma } from "@/lib/db";

// Retención de registros de auditoría: se borran los que tengan más de 30 días
// para que la tabla no se llene de basura.
const AUDIT_RETENTION_DAYS = 30;

// Borra los registros de auditoría más antiguos que AUDIT_RETENTION_DAYS.
// Se ejecuta como best-effort (nunca rompe la operación principal) y con
// control de solapamiento: solo un hilo limpia a la vez.
let cleanupInFlight = false;
export async function cleanupOldAuditLogs(): Promise<number> {
  if (cleanupInFlight) return 0;
  cleanupInFlight = true;
  try {
    const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[audit] Limpieza: ${result.count} registros mayores a ${AUDIT_RETENTION_DAYS} días eliminados`);
    }
    return result.count;
  } catch (error) {
    console.error("Error al limpiar auditoría:", error);
    return 0;
  } finally {
    cleanupInFlight = false;
  }
}

// Registro de auditoría. Guarda quién hizo qué, cuándo y desde dónde.
// Acciones típicas: login, create, update, delete, stock, receive, auth.
// Solo los administradores pueden consultar estos registros (ver /api/audit).
export async function logAudit(input: {
  userId: number;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  description?: string | null;
  details?: unknown;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        userName: input.userName || "",
        userRole: input.userRole || "",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        description: input.description || "",
        details: JSON.stringify(input.details ?? {}),
        ip: input.ip || "",
      },
    });

    // Limpieza periódica: aprovecha cada escritura para revisar (barato porque
    // usa índice por createdAt y el lock evita carreras).
    void cleanupOldAuditLogs();
  } catch (error) {
    console.error("Error al registrar auditoría:", error);
  }
}

// Extrae la IP del cliente desde el encabezado (funciona con proxies locales,
// LAN y Tailscale). No bloquea: si no se puede determinar, devuelve "".
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
}
