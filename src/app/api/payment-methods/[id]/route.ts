import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentMethodSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp, diffDetails } from "@/lib/audit";

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
    const paymentMethodId = parseInt(id, 10);

    if (isNaN(paymentMethodId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = paymentMethodSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.affectsCash !== undefined) updateData.affectsCash = data.affectsCash;
    if (data.active !== undefined) updateData.active = data.active;

    const beforePm = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });

    const paymentMethod = await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: updateData,
    });

    broadcast("payment:change", { id: paymentMethodId });
    void logChange(getDeviceId(), "UPDATE", "paymentmethod", paymentMethodId, updateData);
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "payment-method",
      entityId: paymentMethodId,
      description: `Método de pago modificado: ${paymentMethod.name || '#' + paymentMethodId}`,
      details: {
        cambios: diffDetails(
          { name: beforePm?.name, affectsCash: beforePm?.affectsCash, active: beforePm?.active },
          { name: paymentMethod.name, affectsCash: paymentMethod.affectsCash, active: paymentMethod.active }
        ),
      },
      before: { name: beforePm?.name, affectsCash: beforePm?.affectsCash, active: beforePm?.active },
      after: { name: paymentMethod.name, affectsCash: paymentMethod.affectsCash, active: paymentMethod.active },
      ip: getClientIp(request),
    });
    return Response.json(paymentMethod);
  } catch (error) {
    console.error("Error updating payment method:", error);
    return Response.json({ error: "Error al actualizar método de pago" }, { status: 500 });
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
    const paymentMethodId = parseInt(id, 10);

    if (isNaN(paymentMethodId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await prisma.paymentMethod.findUnique({
      where: { id: paymentMethodId },
    });

    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    broadcast("payment:change", { id: paymentMethodId });
    void logChange(getDeviceId(), "DELETE", "paymentmethod", paymentMethodId, {});
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "payment-method",
      entityId: paymentMethodId,
      description: `Método de pago eliminado: ${existing?.name || '#' + paymentMethodId}`,
      before: { name: existing?.name, affectsCash: existing?.affectsCash, active: existing?.active },
      after: null,
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    return Response.json({ error: "Error al eliminar método de pago" }, { status: 500 });
  }
}
