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
        // Total sales in period
        const salesAgg = await prisma.sale.aggregate({
          _sum: { total: true },
          _count: true,
          where: whereDate,
        });

        // Profit from sales
        const salesWithItems = await prisma.sale.findMany({
          where: whereDate,
          include: { items: { include: { product: { select: { cost: true } } } } },
        });

        let totalCost = 0;
        let totalRevenue = 0;
        for (const sale of salesWithItems) {
          totalRevenue += sale.total;
          for (const item of sale.items) {
            totalCost += (item.product?.cost || 0) * item.quantity;
          }
        }

        // Cash breakdown by category
        const incomeByCategory = await prisma.cashEntry.groupBy({
          by: ["category"],
          where: { type: "INCOME" },
          _sum: { amount: true },
        });
        const expenseByCategory = await prisma.cashEntry.groupBy({
          by: ["category"],
          where: { type: { in: ["EXPENSE", "TRANSFER"] } },
          _sum: { amount: true },
        });

        // All-time total cash in safe
        const allIncome = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: "INCOME" },
        });
        const allExpense = await prisma.cashEntry.aggregate({
          _sum: { amount: true },
          where: { type: { in: ["EXPENSE", "TRANSFER"] } },
        });
        const cashBalance = (allIncome._sum.amount || 0) - (allExpense._sum.amount || 0);

        // Build category map
        const incomeByCat: Record<string, number> = {};
        for (const c of incomeByCategory) incomeByCat[c.category] = c._sum.amount || 0;
        const expenseByCat: Record<string, number> = {};
        for (const c of expenseByCategory) expenseByCat[c.category] = c._sum.amount || 0;

        // Total profits available for withdrawal = sales profit - profit_withdrawals already taken
        const profitWithdrawn = expenseByCat["profit_withdrawal"] || 0;
        const profitCostWithdrawn = expenseByCat["profit_cost_withdrawal"] || 0;
        const netProfit = totalRevenue - totalCost;
        const availableProfit = netProfit - profitWithdrawn;
        const combinedAvailable = (totalRevenue - totalCost) - profitCostWithdrawn;

        return Response.json({
          period: { from: from || "all", to: to || "all" },
          sales: {
            count: salesAgg._count,
            revenue: totalRevenue,
            totalCost,
            profit: netProfit,
            profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0",
            availableProfit,
            combinedAvailable,
          },
          cash: {
            balance: cashBalance,
            incomeByCategory: incomeByCat,
            expenseByCategory: expenseByCat,
            incomeTotal: allIncome._sum.amount || 0,
            expenseTotal: allExpense._sum.amount || 0,
          },
        });
      }

      case "product-breakdown": {
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
        const skip = (page - 1) * limit;
        const search = searchParams.get("q") || "";
        const deptId = searchParams.get("departmentId");

        const where: Record<string, unknown> = { active: true };
        if (search) {
          where.OR = [
            { name: { contains: search } },
            { barcode: { contains: search } },
          ];
        }
        if (deptId) where.departmentId = parseInt(deptId);

        const [products, total] = await Promise.all([
          prisma.product.findMany({
            where,
            include: { department: { select: { name: true } }, supplier: { select: { name: true } } },
            orderBy: { name: "asc" },
            skip,
            take: limit,
          }),
          prisma.product.count({ where }),
        ]);

        const items = products.map((p) => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          publicPrice: p.price,
          costPrice: p.cost,
          profit: p.price - p.cost,
          margin: p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(1) : "0",
          stock: p.stock,
          department: p.department?.name || null,
          supplier: p.supplier?.name || null,
        }));

        return Response.json({
          products: items,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }

      case "cash-entries": {
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")));
        const skip = (page - 1) * limit;
        const type = searchParams.get("type");
        const category = searchParams.get("category");

        const where: Record<string, unknown> = {};
        if (type) where.type = type;
        if (category) where.category = category;
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

    // Admin-only for manual cash entries
    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json();
    const { type, amount, description, category, paymentMethodId, recordedAt } = body;

    if (!type || !["INCOME", "EXPENSE", "TRANSFER"].includes(type)) {
      return Response.json({ error: "Tipo inválido. Usa: INCOME, EXPENSE o TRANSFER" }, { status: 400 });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return Response.json({ error: "Monto inválido" }, { status: 400 });
    }

    // Validate category based on type
    const validCategories = {
      INCOME: ["manual_deposit", "other"],
      EXPENSE: ["profit_withdrawal", "profit_cost_withdrawal", "operating_expense", "purchase", "other"],
      TRANSFER: ["transfer"],
    };
    const finalCategory = category || (type === "EXPENSE" ? "other" : "manual_deposit");
    if (!validCategories[type as keyof typeof validCategories].includes(finalCategory)) {
      return Response.json({
        error: `Categoría inválida para ${type}. Válidas: ${validCategories[type as keyof typeof validCategories].join(", ")}`,
      }, { status: 400 });
    }

    const entry = await prisma.cashEntry.create({
      data: {
        type,
        category: finalCategory,
        amount,
        description: description || "",
        paymentMethodId: paymentMethodId ? parseInt(paymentMethodId) : null,
        userId: parseInt(session.user.id, 10),
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
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
