import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userSchema } from "@/lib/validations";
import { hash } from "bcrypt-ts";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp, diffDetails } from "@/lib/audit";

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  recoveryEmail: true,
  createdAt: true,
} as const;

// Evita que la edición borre campos no enviados: solo se actualizan las
// llaves presentes en el body crudo (el schema usa defaults que si no se
// aplicaran sobrescribirían datos existentes).
function pickProvided<T extends object>(parsed: T, raw: Record<string, unknown>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(parsed)) {
    if (key in raw) out[key] = (parsed as Record<string, unknown>)[key];
  }
  return out as Partial<T>;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = userSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = pickProvided(parsed.data, body as Record<string, unknown>);

    const updateData: Record<string, unknown> = {};

    if (data.username !== undefined) updateData.username = data.username;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.recoveryEmail !== undefined) updateData.recoveryEmail = data.recoveryEmail || null;
    if (data.password) {
      updateData.password = await hash(data.password, 10);
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!existing) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Protección del último administrador activo: no se puede degradar ni
    // desactivar si es el único admin activo que queda.
    if (existing.role === "ADMIN") {
      const losingAdmin =
        (updateData.role !== undefined && updateData.role !== "ADMIN") ||
        (updateData.active === false);
      if (losingAdmin) {
        const activeAdmins = await prisma.user.count({
          where: { role: "ADMIN", active: true, id: { not: userId } },
        });
        if (activeAdmins === 0) {
          return Response.json(
            { error: "No puedes quitar el último administrador activo" },
            { status: 400 }
          );
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT,
    });

    broadcast("user:change", { id: userId });
    void logChange(getDeviceId(), "UPDATE", "user", userId, {
      id: userId,
      ...(updateData.username !== undefined && { username: updateData.username }),
      ...(updateData.name !== undefined && { name: updateData.name }),
      ...(updateData.role !== undefined && { role: updateData.role }),
      ...(updateData.active !== undefined && { active: updateData.active }),
      ...(updateData.recoveryEmail !== undefined && { recoveryEmail: updateData.recoveryEmail }),
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "user",
      entityId: userId,
      description: `Usuario modificado: ${user.name || user.username || '#' + userId}`,
      details: diffDetails(
        { username: existing.username, name: existing.name, role: existing.role, active: existing.active, recoveryEmail: existing.recoveryEmail },
        { username: user.username, name: user.name, role: user.role, active: user.active, recoveryEmail: user.recoveryEmail }
      ),
      before: { username: existing.username, name: existing.name, role: existing.role, active: existing.active, recoveryEmail: existing.recoveryEmail },
      after: { username: user.username, name: user.name, role: user.role, active: user.active, recoveryEmail: user.recoveryEmail },
      ip: getClientIp(request),
    });
    return Response.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    return Response.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    if (session.user.id === id) {
      return Response.json(
        { error: "No puedes eliminarte a ti mismo" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!existing) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Protección del último administrador activo.
    if (existing.role === "ADMIN" && existing.active) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: userId } },
      });
      if (activeAdmins === 0) {
        return Response.json(
          { error: "No puedes eliminar al último administrador activo" },
          { status: 400 }
        );
      }
    }

    // Un usuario con historial (ventas, cortes de caja, reembolsos o entradas
    // de caja) no puede eliminarse físicamente por las restricciones de llave
    // foránea. En ese caso se desactiva (soft-delete) para preservar la
    // integridad de los datos.
    const [hasSales, hasCashEntries, hasRefunds, hasShiftReports] = await Promise.all([
      prisma.sale.count({ where: { userId } }),
      prisma.cashEntry.count({ where: { userId } }),
      prisma.refund.count({ where: { userId } }),
      prisma.shiftReport.count({ where: { userId } }),
    ]);

    const hasHistory = hasSales > 0 || hasCashEntries > 0 || hasRefunds > 0 || hasShiftReports > 0;

    if (hasHistory) {
      // Cerrar sesiones activas y desactivar la cuenta.
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { active: false },
      });

      broadcast("user:change", { id: userId });
      void logChange(getDeviceId(), "UPDATE", "user", userId, { active: false });
      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "delete",
        entity: "user",
        entityId: userId,
        description: `Usuario desactivado (tiene historial): ${existing.name || existing.username || '#' + userId}`,
        details: {
          name: existing.name,
          username: existing.username,
          role: existing.role,
          ventas: hasSales,
          entradasCaja: hasCashEntries,
          reembolsos: hasRefunds,
          cortes: hasShiftReports,
          softDelete: true,
        },
        before: { active: existing.active },
        after: { active: false },
        ip: getClientIp(request),
      });
      return Response.json({ success: true, softDelete: true });
    }

    // Sin historial: se elimina físicamente junto con sus sesiones.
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({
      where: { id: userId },
    });

    broadcast("user:change", { id: userId });
    void logChange(getDeviceId(), "DELETE", "user", userId, {});
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "user",
      entityId: userId,
      description: `Usuario eliminado: ${existing.name || existing.username || '#' + userId}`,
      before: {
        username: existing.username,
        name: existing.name,
        role: existing.role,
        active: existing.active,
        recoveryEmail: existing.recoveryEmail,
      },
      after: null,
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return Response.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}
