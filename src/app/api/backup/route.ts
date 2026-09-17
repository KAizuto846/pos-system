import { auth } from "@/lib/auth";
import { getBackupConfig, saveBackupConfig, runBackup, listBackupFiles } from "@/lib/backup";
import { logAudit, getClientIp } from "@/lib/audit";
import * as fs from "node:fs";
import * as path from "node:path";

// GET /api/backup — configuración + lista de archivos, o descarga uno con ?download=<nombre>
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "ADMIN") return Response.json({ error: "Solo administradores" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download");

    const config = await getBackupConfig();

    if (download) {
      const safe = path.basename(download);
      const full = path.join(config.folder, safe);
      if (!fs.existsSync(full)) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
      const buffer = fs.readFileSync(full);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${safe}"`,
        },
      });
    }

    const files = listBackupFiles(config.folder);
    return Response.json({ ok: true, config, files });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// POST /api/backup — body: { action: "run" } ejecuta ahora, o { action: "save", config: {...} }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "ADMIN") return Response.json({ error: "Solo administradores" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const action = body?.action || "save";

    if (action === "run") {
      const config = await getBackupConfig();
      const result = await runBackup(config);
      if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "create",
        entity: "backup",
        entityId: null,
        description: `Respaldo manual ejecutado: ${result.file}`,
        details: { file: result.file },
        ip: getClientIp(request),
      });
      const files = listBackupFiles(config.folder);
      return Response.json({ ok: true, file: result.file, files });
    }

    if (action === "save") {
      const c = body?.config || {};
      const config = await saveBackupConfig({
        enabled: Boolean(c.enabled),
        intervalHours: Math.max(1, Math.min(8760, Number(c.intervalHours) || 24)),
        retentionDays: Math.max(1, Math.min(3650, Number(c.retentionDays) || 30)),
        folder: typeof c.folder === "string" ? c.folder.trim() : "",
      });
      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "update",
        entity: "backup",
        entityId: null,
        description: "Configuración de respaldos actualizada",
        details: { enabled: config.enabled, intervalHours: config.intervalHours, retentionDays: config.retentionDays, folder: config.folder },
        ip: getClientIp(request),
      });
      return Response.json({ ok: true, config });
    }

    return Response.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
