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
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const timeFrom = searchParams.get("timeFrom") || "00:00";
    const timeTo = searchParams.get("timeTo") || "23:59";

    if (!supplierId || !dateFrom || !dateTo) {
      return Response.json(
        { error: "Se requieren supplierId, dateFrom y dateTo" },
        { status: 400 }
      );
    }

    const sid = parseInt(supplierId);
    if (isNaN(sid)) {
      return Response.json({ error: "supplierId inválido" }, { status: 400 });
    }

    // Construir fechas con horas
    const fromDate = new Date(`${dateFrom}T${timeFrom}:00`);
    const toDate = new Date(`${dateTo}T${timeTo}:59`);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return Response.json({ error: "Fechas inválidas" }, { status: 400 });
    }

    // Obtener ventas en el rango, agrupadas por producto del proveedor
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
        product: {
          supplierId: sid,
          active: true,
        },
      },
      include: {
        product: {
          include: {
            department: true,
            supplier: true,
          },
        },
      },
    });

    // Agrupar por producto y sumar cantidades
    const grouped = new Map<
      number,
      {
        productId: number;
        name: string;
        barcode: string;
        price: number;
        cost: number;
        stock: number;
        minStock: number;
        department: { id: number; name: string } | null;
        supplierPrice: number | null;
        totalSold: number;
      }
    >();

    for (const item of saleItems) {
      const pid = item.productId;
      const existing = grouped.get(pid);
      if (existing) {
        existing.totalSold += item.quantity;
      } else {
        grouped.set(pid, {
          productId: pid,
          name: item.product.name,
          barcode: item.product.barcode,
          price: item.product.price,
          cost: item.product.cost,
          stock: item.product.stock,
          minStock: item.product.minStock,
          department: item.product.department,
          supplierPrice: null, // Se podría obtener de ProductLine
          totalSold: item.quantity,
        });
      }
    }

    // Ordenar por más vendidos primero
    const result = Array.from(grouped.values()).sort(
      (a, b) => b.totalSold - a.totalSold
    );

    return Response.json({
      supplierId: sid,
      dateFrom: fromDate.toISOString(),
      dateTo: toDate.toISOString(),
      totalProducts: result.length,
      totalUnits: result.reduce((s, p) => s + p.totalSold, 0),
      products: result,
    });
  } catch (error) {
    console.error("Error getting sales by supplier:", error);
    return Response.json(
      { error: "Error al obtener ventas del proveedor" },
      { status: 500 }
    );
  }
}
