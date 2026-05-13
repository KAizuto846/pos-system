import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
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
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json(
        { error: "Debe proporcionar al menos un item recibido" },
        { status: 400 }
      );
    }

    const order = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return Response.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    if (order.status === "received" || order.status === "cancelled") {
      return Response.json(
        { error: `La orden ya está ${order.status === "received" ? "recibida" : "cancelada"}` },
        { status: 400 }
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const { orderItemId, receivedQuantity } = item;

        if (typeof receivedQuantity !== "number" || receivedQuantity < 0) {
          throw new Error(`Cantidad recibida inválida para el item ${orderItemId}`);
        }

        const orderItem = order.items.find((oi) => oi.id === orderItemId);
        if (!orderItem) {
          throw new Error(`Item de orden ${orderItemId} no encontrado`);
        }

        if (receivedQuantity > orderItem.quantity) {
          throw new Error(
            `Cantidad recibida (${receivedQuantity}) excede la cantidad ordenada (${orderItem.quantity}) para el producto`
          );
        }

        // Update the order item
        await tx.supplierOrderItem.update({
          where: { id: orderItemId },
          data: {
            receivedQuantity,
            received: receivedQuantity >= orderItem.quantity,
          },
        });

        // Update product stock if received > 0
        if (receivedQuantity > 0) {
          await tx.product.update({
            where: { id: orderItem.productId },
            data: { stock: { increment: receivedQuantity } },
          });
        }
      }

      // Determine overall order status
      const updatedItems = await tx.supplierOrderItem.findMany({
        where: { supplierOrderId: orderId },
      });

      const totalOrdered = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
      const totalReceived = updatedItems.reduce((sum, i) => sum + i.receivedQuantity, 0);

      let newStatus: string;
      if (totalReceived === 0) {
        newStatus = order.status === "sent" ? "sent" : "pending";
      } else if (totalReceived >= totalOrdered) {
        newStatus = "received";
      } else {
        newStatus = "partial";
      }

      const updatedOrder = await tx.supplierOrder.update({
        where: { id: orderId },
        data: { status: newStatus },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      return updatedOrder;
    });

    return Response.json(updatedOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al recibir orden";
    console.error("Error receiving order:", error);

    if (
      message.includes("no encontrado") ||
      message.includes("excede") ||
      message.includes("inválida")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: "Error al recibir orden" }, { status: 500 });
  }
}
