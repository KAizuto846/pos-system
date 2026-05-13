import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { supplierSchema } from "@/lib/validations";

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

    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: updateData,
    });

    return Response.json(supplier);
  } catch (error) {
    console.error("Error updating supplier:", error);
    return Response.json({ error: "Error al actualizar proveedor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
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

    await prisma.supplier.delete({
      where: { id: supplierId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return Response.json({ error: "Error al eliminar proveedor" }, { status: 500 });
  }
}
