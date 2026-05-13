import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return Response.json(
        { error: "startDate y endDate son requeridos" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Response.json(
        { error: "Fechas inválidas" },
        { status: 400 }
      );
    }

    end.setHours(23, 59, 59, 999);

    // Sales count and total revenue
    const salesInRange = await prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        items: {
          include: { product: true },
        },
        paymentMethod: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const salesCount = salesInRange.length;
    const totalRevenue = salesInRange.reduce((sum, s) => sum + s.total, 0);

    // Top products
    const productSales: Record<number, { name: string; quantity: number; revenue: number }> = {};

    for (const sale of salesInRange) {
      for (const item of sale.items) {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            name: item.product.name,
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].revenue += item.price * item.quantity;
      }
    }

    const topProducts = Object.entries(productSales)
      .map(([id, data]) => ({
        productId: parseInt(id),
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Sales by payment method
    const salesByPaymentMethod: Record<string, { count: number; total: number }> = {};

    for (const sale of salesInRange) {
      const methodName = sale.paymentMethod?.name || "Sin método";
      if (!salesByPaymentMethod[methodName]) {
        salesByPaymentMethod[methodName] = { count: 0, total: 0 };
      }
      salesByPaymentMethod[methodName].count++;
      salesByPaymentMethod[methodName].total += sale.total;
    }

    const salesByPayment = Object.entries(salesByPaymentMethod).map(
      ([name, data]) => ({
        name,
        ...data,
      })
    );

    // Daily breakdown
    const dailyMap: Record<string, { count: number; total: number }> = {};

    for (const sale of salesInRange) {
      const day = sale.createdAt.toISOString().split("T")[0];
      if (!dailyMap[day]) {
        dailyMap[day] = { count: 0, total: 0 };
      }
      dailyMap[day].count++;
      dailyMap[day].total += sale.total;
    }

    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        ...data,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const report = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      salesCount,
      totalRevenue,
      topProducts,
      salesByPaymentMethod: salesByPayment,
      dailyBreakdown,
    };

    return Response.json(report);
  } catch (error) {
    console.error("Error generating report:", error);
    return Response.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
