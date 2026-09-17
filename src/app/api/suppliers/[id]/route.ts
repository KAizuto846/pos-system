import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { supplierSchema } from "@/lib/validations";
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
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = supplierSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.contact !== undefined) updateData.contact = data.contact;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.active !== undefined) updateData.active = data.active;

    const beforeSupplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: updateData,
    });

    broadcast("supplier:change", { id: supplierId });
    void logChange(getDeviceId(), "UPDATE", "supplier", supplierId, updateData);
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "supplier",
      entityId: supplierId,
      description: `Proveedor modificado: ${supplier.name || '#' + supplierId}`,
      details: {
        cambios: diffDetails(
          { name: beforeSupplier?.name, contact: beforeSupplier?.contact, phone: beforeSupplier?.phone, email: beforeSupplier?.email, address: beforeSupplier?.address, active: beforeSupplier?.active },
          { name: supplier.name, contact: supplier.contact, phone: supplier.phone, email: supplier.email, address: supplier.address, active: supplier.active }
        ),
      },
      before: { name: beforeSupplier?.name, contact: beforeSupplier?.contact, phone: beforeSupplier?.phone, email: beforeSupplier?.email, address: beforeSupplier?.address, active: beforeSupplier?.active },
      after: { name: supplier.name, contact: supplier.contact, phone: supplier.phone, email: supplier.email, address: supplier.address, active: supplier.active },
      ip: getClientIp(request),
    });
    return Response.json(supplier);
  } catch (error) {
    console.error("Error updating supplier:", error);
    return Response.json({ error: "Error al actualizar proveedor" }, { status: 500 });
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
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    await prisma.supplier.delete({
      where: { id: supplierId },
    });

    broadcast("supplier:change", { id: supplierId });
    void logChange(getDeviceId(), "DELETE", "supplier", supplierId, {});
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "supplier",
      entityId: supplierId,
      description: `Proveedor eliminado: ${existing?.name || '#' + supplierId}`,
      before: { name: existing?.name, contact: existing?.contact, phone: existing?.phone, email: existing?.email, active: existing?.active },
      after: null,
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return Response.json({ error: "Error al eliminar proveedor" }, { status: 500 });
  }
}
