import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");

    if (!supplierId) {
      return Response.json(
        { error: "Se requiere supplierId" },
        { status: 400 }
      );
    }

    const sid = parseInt(supplierId);
    if (isNaN(sid)) {
      return Response.json({ error: "supplierId inválido" }, { status: 400 });
    }

    // Obtener órdenes recibidas del proveedor con todos sus items
    const orders = await prisma.supplierOrder.findMany({
      where: {
        supplierId: sid,
        status: "received",
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                department: true,
              },
            },
          },
        },
      },
    });

    // Agrupar por producto y sumar cantidades pendientes
    const pendingMap = new Map<
      number,
      {
        productId: number;
        name: string;
        barcode: string;
        stock: number;
        price: number;
        cost: number;
        department: { id: number; name: string } | null;
        pendingQuantity: number;
      }
    >();

    for (const order of orders) {
      for (const item of order.items) {
        const pending = item.quantity - item.receivedQuantity;
        if (pending <= 0) continue;

        const pid = item.productId;
        const existing = pendingMap.get(pid);
        if (existing) {
          existing.pendingQuantity += pending;
        } else {
          pendingMap.set(pid, {
            productId: pid,
            name: item.product.name,
            barcode: item.product.barcode,
            stock: item.product.stock,
            price: item.product.price,
            cost: item.product.cost,
            department: item.product.department,
            pendingQuantity: pending,
          });
        }
      }
    }

    const products = Array.from(pendingMap.values()).sort(
      (a, b) => b.pendingQuantity - a.pendingQuantity
    );

    return Response.json({
      supplierId: sid,
      products,
    });
  } catch (error) {
    console.error("Error getting pending items:", error);
    return Response.json(
      { error: "Error al obtener items pendientes" },
      { status: 500 }
    );
  }
}
