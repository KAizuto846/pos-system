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
    const { status, items, notes } = body;

    // If items are provided, update them (editing quantities/notes) and create stock batches for received items
    if (items && Array.isArray(items)) {
      await prisma.$transaction(async (tx) => {
        for (const item of items) {
          // Read current receivedQuantity BEFORE updating
          const current = await tx.supplierOrderItem.findUnique({
            where: { id: item.id },
            select: { receivedQuantity: true },
          });
          const oldQty = current?.receivedQuantity ?? 0;
          const newTotalQty = item.receivedQuantity ?? 0;
          const deltaQty = Math.max(0, newTotalQty - oldQty);

          await tx.supplierOrderItem.update({
            where: { id: item.id },
            data: {
              quantity: item.quantity ?? undefined,
              receivedQuantity: item.receivedQuantity ?? undefined,
              notes: item.notes ?? undefined,
            },
          });

          // Create stock batch for newly received quantity
          const batchInfo = item.batch;
          if (deltaQty > 0 && item.productId) {
            await tx.stockBatch.create({
              data: {
                productId: item.productId,
                quantity: deltaQty,
                expiryDate: batchInfo?.expiryDate ? new Date(batchInfo.expiryDate) : null,
                batchCode: batchInfo?.batchCode || '',
                receivedVia: 'order',
                notes: `Recibido en pedido #${orderId}`,
              },
            });

            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: deltaQty } },
            });
          }
        }
      });

      const order = await prisma.supplierOrder.findUnique({
        where: { id: orderId },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      });

      return Response.json(order);
    }

    // Otherwise update status
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
