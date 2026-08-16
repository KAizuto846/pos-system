import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userSchema } from "@/lib/validations";
import { hash } from "bcrypt-ts";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp } from "@/lib/audit";

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

    const data = parsed.data;

    const updateData: Record<string, unknown> = {};

    if (data.username !== undefined) updateData.username = data.username;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) {
      updateData.password = await hash(data.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    broadcast("user:change", { id: userId });
    void logChange(getDeviceId(), "UPDATE", "user", userId, {
      id: userId,
      ...(data.username && { username: data.username }),
      ...(data.name && { name: data.name }),
      ...(data.role && { role: data.role }),
      ...(data.active !== undefined && { active: data.active }),
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "user",
      entityId: userId,
      description: `Usuario modificado: ${user.name || '#' + userId}`,
      details: updateData,
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
      select: { name: true, username: true },
    });

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
      description: `Usuario eliminado: ${existing?.name || existing?.username || '#' + userId}`,
      details: { name: existing?.name, username: existing?.username },
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return Response.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}
