import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "summary";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + "T23:59:59.999Z");

    const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    switch (action) {
      case "summary": {
        // Total sales
        const salesAgg = await prisma.sale.aggregate({
          _sum: { total: true },
          _count: true,
          where: whereDate,
        });

        // Profit from sales (sum of (price - cost) * quantity)
        const salesWithItems = await prisma.sale.findMany({
          where: whereDate,
          include: {
            items: {
              include: { product: { select: { cost: true } } },
            },
          },
        });

        let totalCost = 0;
        let totalRevenue = 0;
        for (const sale of salesWithItems) {
          totalRevenue += sale.total;
          for (const item of sale.items) {
            totalCost += (item.product?.cost || 0) * item.quantity;
          }
        }

        // Cash balance (sum of all INCOME - EXPENSE entries)
        const cashAgg = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: {
            type: "INCOME",
            ...(Object.keys(dateFilter).length > 0 ? { recordedAt: dateFilter } : {}),
          },
        });
        const expenseAgg = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: {
            type: { in: ["EXPENSE", "TRANSFER"] },
            ...(Object.keys(dateFilter).length > 0 ? { recordedAt: dateFilter } : {}),
          },
        });

        // Total cash balance (all time)
        const allIncome = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: "INCOME" },
        });
        const allExpense = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: { in: ["EXPENSE", "TRANSFER"] } },
        });
        const cashBalance = (allIncome._sum.amount || 0) - (allExpense._sum.amount || 0);

        return Response.json({
          period: { from: from || "all", to: to || "all" },
          sales: {
            count: salesAgg._count,
            revenue: totalRevenue,
            totalCost,
            profit: totalRevenue - totalCost,
            profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : "0",
          },
          cash: {
            income: cashAgg._sum.amount || 0,
            expenses: expenseAgg._sum.amount || 0,
            balance: cashBalance,
          },
        });
      }

      case "cash-entries": {
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
        const skip = (page - 1) * limit;
        const type = searchParams.get("type"); // INCOME, EXPENSE, or null for all

        const where: Record<string, unknown> = {};
        if (type) where.type = type;
        if (Object.keys(dateFilter).length > 0) where.recordedAt = dateFilter;

        const [entries, total] = await Promise.all([
          prisma.cashEntry.findMany({
            where,
            include: {
              paymentMethod: { select: { name: true } },
              user: { select: { name: true } },
              sale: { select: { id: true, total: true } },
            },
            orderBy: { recordedAt: "desc" },
            skip,
            take: limit,
          }),
          prisma.cashEntry.count({ where }),
        ]);

        return Response.json({
          entries,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }

      case "cash-balance": {
        const allIncome = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: "INCOME" },
        });
        const allExpense = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: { in: ["EXPENSE", "TRANSFER"] } },
        });
        const balance = (allIncome._sum.amount || 0) - (allExpense._sum.amount || 0);

        return Response.json({ balance });
      }

      default:
        return Response.json({ error: "Acción no válida" }, { status: 400 });
    }
  } catch (error) {
    console.error("Finance error:", error);
    return Response.json({ error: "Error al obtener datos financieros" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { type, amount, description, paymentMethodId } = body;

    if (!type || !["INCOME", "EXPENSE", "TRANSFER"].includes(type)) {
      return Response.json({ error: "Tipo inválido. Usa: INCOME, EXPENSE o TRANSFER" }, { status: 400 });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return Response.json({ error: "Monto inválido" }, { status: 400 });
    }

    const entry = await prisma.cashEntry.create({
      data: {
        type,
        amount,
        description: description || "",
        paymentMethodId: paymentMethodId ? parseInt(paymentMethodId) : null,
        userId: parseInt(session.user.id, 10),
      },
      include: {
        paymentMethod: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    return Response.json(entry, { status: 201 });
  } catch (error) {
    console.error("Cash entry error:", error);
    return Response.json({ error: "Error al crear entrada de caja" }, { status: 500 });
  }
}
