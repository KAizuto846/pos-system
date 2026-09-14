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

    const saleWhere = { createdAt: { gte: start, lte: end } };
    const [salesAggregate, salesInRange, itemsInRange] = await Promise.all([
      prisma.sale.aggregate({
        where: saleWhere,
        _count: true,
        _sum: { total: true },
      }),
      prisma.sale.findMany({
        where: saleWhere,
        select: {
          total: true,
          createdAt: true,
          paymentMethod: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: {
          productId: true,
          quantity: true,
          price: true,
          product: { select: { name: true } },
        },
      }),
    ]);

    const salesCount = salesAggregate._count;
    const totalRevenue = salesAggregate._sum.total || 0;

    // Top products
    const productSales: Record<number, { name: string; quantity: number; revenue: number }> = {};

    for (const item of itemsInRange) {
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
