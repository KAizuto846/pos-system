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

    // Obtener órdenes del proveedor (no canceladas) con todos sus items
    const orders = await prisma.supplierOrder.findMany({
      where: {
        supplierId: sid,
        status: { not: "cancelled" },
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              include: {
                department: true,
                productLines: {
                  select: { supplierId: true, supplierPrice: true, isPrimary: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Gestión de cajas: los items en cajas se acumulan en su unidad base
    // (piezas) para no romper la suma con productos por pieza.
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
        supplierPrice: number | null;
        pendingQuantity: number;
        soldByBox?: boolean;
        unitsPerBox?: number | null;
        boxRemainder?: number;
      }
    >();

    for (const order of orders) {
      for (const item of order.items) {
        const unitPending =
          item.isBox && item.unitsPerBox
            ? (item.quantity - item.receivedQuantity) * item.unitsPerBox
            : item.quantity - item.receivedQuantity;
        if (unitPending <= 0) continue;

        const pid = item.productId;
        if (!pid || !item.product) continue;
        const existing = pendingMap.get(pid);
        if (existing) {
          existing.pendingQuantity += unitPending;
        } else {
          const lines = item.product.productLines || [];
          const line = lines.find(l => l.supplierId === sid && l.isPrimary)
            ?? lines.find(l => l.supplierId === sid);
          pendingMap.set(pid, {
            productId: pid,
            name: item.product.name,
            barcode: item.product.barcode,
            stock: item.product.stock,
            price: item.product.price,
            cost: item.product.cost,
            department: item.product.department,
            supplierPrice: line?.supplierPrice ?? null,
            pendingQuantity: unitPending,
            soldByBox: item.product.soldByBox,
            unitsPerBox: item.product.unitsPerBox,
            boxRemainder: item.product.boxRemainder,
          });
        }
      }
    }

    const products = Array.from(pendingMap.values()).sort(
      (a, b) => b.pendingQuantity - a.pendingQuantity
    );

    // Orden con más items pendientes (contexto del proveedor)
    const supplierName = orders.length > 0 ? orders[0].supplier?.name || null : null;

    return Response.json({
      supplierId: sid,
      supplierName,
      totalOrdersWithPending: orders.filter((o) =>
        o.items.some((i) => (i.quantity - i.receivedQuantity) * (i.isBox && i.unitsPerBox ? i.unitsPerBox : 1) > 0)
      ).length,
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
