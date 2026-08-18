import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalUsers,
      totalProducts,
      totalSalesResult,
      todaySalesResult,
      totalRevenueResult,
      todayRevenueResult,
      cashInDrawerResult,
      lowStockProducts,
      todayCashiers,
      expiringBatches,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.sale.count(),
      prisma.sale.count({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.sale.aggregate({
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          paymentMethod: {
            affectsCash: true,
          },
        },
        _sum: { total: true },
      }),
      prisma.product.findMany({
        where: {
          active: true,
          stock: { lte: prisma.product.fields.minStock },
        },
        orderBy: { stock: "asc" },
        include: {
          supplier: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.sale.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.productBatch.findMany({
        where: {
          quantity: { gt: 0 },
          expiresAt: { gte: todayStart, lte: new Date(todayStart.getTime() + 60 * 24 * 60 * 60 * 1000) },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              stock: true,
              supplier: { select: { id: true, name: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { expiresAt: "asc" },
      }),
    ]);

    // Get user names for cashier breakdown
    const userIds = todayCashiers.map((c) => c.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const salesByCashier = todayCashiers.map((c) => ({
      userId: c.userId,
      name: userMap.get(c.userId) || "Desconocido",
      total: c._sum.total || 0,
      count: c._count.id,
    }));

    const stats = {
      totalUsers,
      totalProducts,
      totalSales: totalSalesResult,
      todaySales: todaySalesResult,
      totalRevenue: totalRevenueResult._sum.total || 0,
      todayRevenue: todayRevenueResult._sum.total || 0,
      cashInDrawer: cashInDrawerResult._sum.total || 0,
      lowStockProducts: lowStockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        minStock: p.minStock,
        supplierId: p.supplier?.id ?? null,
        supplierName: p.supplier?.name ?? null,
        departmentId: p.department?.id ?? null,
        departmentName: p.department?.name ?? null,
      })),
      salesByCashier,
      expiringProducts: expiringBatches.map((b) => ({
        productId: b.product.id,
        name: b.product.name,
        stock: b.product.stock,
        quantity: b.quantity,
        expiresAt: b.expiresAt,
        supplierId: b.product.supplier?.id ?? null,
        supplierName: b.product.supplier?.name ?? null,
        departmentId: b.product.department?.id ?? null,
        departmentName: b.product.department?.name ?? null,
      })),
    };

    return Response.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    return Response.json({ error: "Error al obtener estadísticas" }, { status: 500 });
  }
}
