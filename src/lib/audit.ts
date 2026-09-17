import { prisma } from "@/lib/db";

// Retención de registros de auditoría: se borran los que tengan más de 1 año
// para que la tabla no crezca indefinidamente pero conservando un historial
// largo y detallado.
const AUDIT_RETENTION_DAYS = 365;

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
// Para poder reconstruir exactamente qué cambió, acepta `before` y `after`
// (objetos con los valores previos y nuevos). Solo los administradores pueden
// consultar estos registros (ver /api/audit).
export async function logAudit(input: {
  userId: number;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  description?: string | null;
  details?: unknown;
  before?: unknown;
  after?: unknown;
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
        before: JSON.stringify(input.before ?? {}),
        after: JSON.stringify(input.after ?? {}),
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

// Convierte un valor cualquiera a algo serializable en JSON (fechas → ISO).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonSafe(value: any): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = jsonSafe(v);
    }
    return out;
  }
  return value;
}

// Diferencia campo por campo entre el estado previo y el nuevo.
// Devuelve { campo: { antes, despues } } solo con los campos que cambiaron.
// Se usa en auditoría para dejar constancia exacta del valor previo.
export function diffDetails(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: string[]
): Record<string, { antes: unknown; despues: unknown }> {
  const result: Record<string, { antes: unknown; despues: unknown }> = {};
  if (!before || !after) return result;
  const keys = fields
    ? fields.filter((f) => f in before || f in after)
    : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    const a = jsonSafe(before[key]);
    const b = jsonSafe(after[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      result[key] = { antes: a ?? null, despues: b ?? null };
    }
  }
  return result;
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
