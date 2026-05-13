import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VALID_STATUSES = ["pending", "sent", "partial", "received", "cancelled"];

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
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json(
        {
          error: "Estado inválido. Valores válidos: " + VALID_STATUSES.join(", "),
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };

    if (status === "sent") {
      updateData.sentAt = new Date();
    }

    const order = await prisma.supplierOrder.update({
      where: { id: orderId },
      data: updateData,
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
    });

    return Response.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    return Response.json({ error: "Error al actualizar orden" }, { status: 500 });
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
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.supplierOrder.delete({
      where: { id: orderId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return Response.json({ error: "Error al eliminar orden" }, { status: 500 });
  }
}
