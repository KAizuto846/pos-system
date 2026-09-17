import { auth } from "@/lib/auth";
import { isHelperRole, helperForbidden } from "@/lib/roles";
import { initializePrisma, prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const VALID_STATUSES = ["pending", "sent", "partial", "received", "cancelled", "on_hold", "ready"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  partial: "Parcial",
  received: "Recibido",
  cancelled: "Cancelado",
  on_hold: "En espera",
  ready: "Listo",
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (isHelperRole(session.user.role)) {
      return helperForbidden("pedidos");
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
      // Detalle de auditoría: qué cambió en cada item (antes → después)
      const itemAudit: Array<Record<string, unknown>> = [];

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const item of items) {
          if (typeof item.id === "number" && Number.isFinite(item.id) && item.id > 0) {
            const before = await tx.supplierOrderItem.findUnique({
              where: { id: item.id },
              select: {
                quantity: true,
                receivedQuantity: true,
                notes: true,
                productName: true,
                product: { select: { name: true } },
              },
            });
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
            if (before) {
              const cambios: Record<string, unknown> = {};
              if (before.quantity !== item.quantity && item.quantity !== undefined) {
                cambios.cantidad = { antes: before.quantity, despues: item.quantity };
              }
              if (before.receivedQuantity !== item.receivedQuantity && item.receivedQuantity !== undefined) {
                cambios.recibido = { antes: before.receivedQuantity, despues: item.receivedQuantity };
              }
              if ((before.notes ?? "") !== (item.notes ?? "") && item.notes !== undefined) {
                cambios.notas = { antes: before.notes ?? "", despues: item.notes ?? "" };
              }
              if (Object.keys(cambios).length > 0) {
                itemAudit.push({
                  item: before.product?.name || before.productName || `#${item.id}`,
                  cambios,
                });
              }
            }
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
            itemAudit.push({
              item: created.productName || `#${created.productId}`,
              agregado: { cantidad: created.quantity, costo: created.costPrice },
            });
          }
        }
        if (Array.isArray(removedItemIds) && removedItemIds.length > 0) {
          const removed = await tx.supplierOrderItem.findMany({
            where: { id: { in: removedItemIds } },
            select: { id: true, productName: true, quantity: true, product: { select: { name: true } } },
          });
          await tx.supplierOrderItem.deleteMany({
            where: { id: { in: removedItemIds } },
          });
          for (const removedId of removedItemIds as number[]) {
            itemChanges.push({ op: "DELETE", id: removedId, data: {} });
          }
          for (const r of removed) {
            itemAudit.push({
              item: r.product?.name || r.productName || `#${r.id}`,
              eliminado: { cantidad: r.quantity },
            });
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

      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "update",
        entity: "order",
        entityId: orderId,
        description: `Pedido #${orderId} editado (${order?.supplier?.name || 'proveedor'})`,
        details: { cambios: itemAudit },
        before: { items: itemAudit.filter((i) => i.cambios) },
        after: { items: itemAudit },
        ip: getClientIp(request),
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

    const beforeOrder = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      select: { status: true, notes: true },
    });

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
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "order",
      entityId: orderId,
      description: `Pedido #${orderId}: estado ${STATUS_LABELS[String(beforeOrder?.status) || '']} → ${STATUS_LABELS[status] || status}`,
      details: {
        cambios: { estado: { antes: STATUS_LABELS[String(beforeOrder?.status)] || beforeOrder?.status, despues: STATUS_LABELS[status] || status } },
      },
      before: { status: beforeOrder?.status },
      after: { status },
      ip: getClientIp(request),
    });
    return Response.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    return Response.json({ error: "Error al actualizar orden" }, { status: 500 });
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
    if (isHelperRole(session.user.role)) {
      return helperForbidden("pedidos");
    }

    const { id } = await params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        supplier: { select: { name: true } },
        items: { select: { productName: true, product: { select: { name: true } }, quantity: true } },
      },
    });

    await prisma.supplierOrder.delete({
      where: { id: orderId },
    });

    void logChange(getDeviceId(), "DELETE", "order", orderId, {});
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "order",
      entityId: orderId,
      description: `Pedido #${orderId} eliminado (${existing?.supplier?.name || 'proveedor'})`,
      before: {
        proveedor: existing?.supplier?.name,
        estado: existing ? STATUS_LABELS[existing.status] || existing.status : undefined,
        items: existing?.items.map((i) => ({
          producto: i.product?.name || i.productName,
          cantidad: i.quantity,
        })),
      },
      after: null,
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return Response.json({ error: "Error al eliminar orden" }, { status: 500 });
  }
}
