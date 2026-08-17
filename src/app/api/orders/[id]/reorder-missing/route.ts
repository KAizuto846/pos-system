import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

// Crea un pedido nuevo al mismo proveedor con las piezas que faltaron por
// recibir, conservando el precio de compra original (costPrice) aunque el
// precio actual del proveedor haya subido.
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

    const order = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return Response.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const missing = order.items.filter((i) => i.quantity - i.receivedQuantity > 0);
    if (missing.length === 0) {
      return Response.json(
        { error: "Esta orden no tiene piezas faltantes" },
        { status: 400 }
      );
    }

    await initializePrisma();
    const newOrder = await prisma.$transaction(async (tx) => {
      return tx.supplierOrder.create({
        data: {
          supplierId: order.supplierId,
          notes: order.notes ? `${order.notes} | Re-pedido de faltantes del pedido #${orderId}` : `Re-pedido de faltantes del pedido #${orderId}`,
          items: {
            create: missing.map((m) => ({
              productId: m.productId,
              productName: m.product?.name ?? m.productName,
              productBarcode: m.product?.barcode ?? m.productBarcode,
              quantity: m.quantity - m.receivedQuantity,
              costPrice: m.costPrice ?? m.product?.cost ?? 0,
              isBox: m.isBox === true ? true : undefined,
              unitsPerBox: m.isBox === true ? m.unitsPerBox ?? null : undefined,
            })),
          },
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      });
    });

    broadcast("order:create", { id: newOrder.id });
    void logChange(getDeviceId(), "CREATE", "order", newOrder.id, {
      id: newOrder.id,
      reorderOf: orderId,
      supplierId: newOrder.supplierId,
      items: missing.map((m) => ({
        productId: m.productId,
        quantity: m.quantity - m.receivedQuantity,
      })),
    });
    return Response.json(newOrder, { status: 201 });
  } catch (error) {
    console.error("Error reordering missing:", error);
    return Response.json({ error: "Error al repedir faltantes" }, { status: 500 });
  }
}
