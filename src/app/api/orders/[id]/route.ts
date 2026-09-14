import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import type { Prisma } from "@prisma/client";

const VALID_STATUSES = ["pending", "sent", "partial", "received", "cancelled", "on_hold", "ready"];

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
    const { status, items, notes, removedItemIds } = body;

    // If items are provided, update them (editing quantities/notes, adding or removing rows)
    if (items && Array.isArray(items)) {
      await initializePrisma();

      interface ItemChange {
        op: "CREATE" | "UPDATE" | "DELETE";
        id: number;
        data: Record<string, unknown>;
      }
      const itemChanges: ItemChange[] = [];

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const item of items) {
          if (typeof item.id === "number" && Number.isFinite(item.id) && item.id > 0) {
            await tx.supplierOrderItem.update({
              where: { id: item.id },
              data: {
                quantity: item.quantity ?? undefined,
                receivedQuantity: item.receivedQuantity ?? undefined,
                notes: item.notes ?? undefined,
              },
            });
            itemChanges.push({
              op: "UPDATE",
              id: item.id,
              data: {
                quantity: item.quantity ?? undefined,
                receivedQuantity: item.receivedQuantity ?? undefined,
                notes: item.notes ?? undefined,
              },
            });
          } else {
            // Item nuevo (agregado desde el detalle del pedido)
            const isGhost = typeof item.productId !== "number";
            const created = await tx.supplierOrderItem.create({
              data: {
                supplierOrderId: orderId,
                productId: isGhost ? null : item.productId,
                productName: isGhost ? String(item.name || "").trim() : "",
                productBarcode: isGhost ? String(item.barcode || "").trim() : "",
                quantity: item.quantity ?? 1,
                costPrice: typeof item.cost === "number" ? item.cost : null,
                isBox: item.isBox === true ? true : undefined,
                unitsPerBox: item.isBox === true ? item.unitsPerBox ?? null : undefined,
              },
            });
            itemChanges.push({
              op: "CREATE",
              id: created.id,
              data: {
                id: created.id,
                supplierOrderId: orderId,
                productId: created.productId,
                productName: created.productName,
                productBarcode: created.productBarcode,
                quantity: created.quantity,
                costPrice: created.costPrice,
                isBox: created.isBox,
                unitsPerBox: created.unitsPerBox,
              },
            });
          }
        }
        if (Array.isArray(removedItemIds) && removedItemIds.length > 0) {
          await tx.supplierOrderItem.deleteMany({
            where: { id: { in: removedItemIds } },
          });
          for (const removedId of removedItemIds as number[]) {
            itemChanges.push({ op: "DELETE", id: removedId, data: {} });
          }
        }
      });

      for (const change of itemChanges) {
        void logChange(getDeviceId(), change.op, "supplierorderitem", change.id, change.data);
      }

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

    void logChange(getDeviceId(), "UPDATE", "order", orderId, updateData);
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

    void logChange(getDeviceId(), "DELETE", "order", orderId, {});
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return Response.json({ error: "Error al eliminar orden" }, { status: 500 });
  }
}
