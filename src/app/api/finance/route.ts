import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

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
    // Entradas de caja filtran por recordedAt (no createdAt)
    const whereEntryDate = Object.keys(dateFilter).length > 0 ? { recordedAt: dateFilter } : {};

    switch (action) {
      case "summary": {
        const paymentMethods = await prisma.paymentMethod.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        });
        // Caja fuerte = metodos con affectsCash + entradas sin metodo
        const affectsCashIds = paymentMethods.filter((pm) => pm.affectsCash).map((pm) => pm.id);
        const cashMethodFilter = {
          OR: [
            { paymentMethodId: null },
            ...(affectsCashIds.length > 0 ? [{ paymentMethodId: { in: affectsCashIds } }] : []),
          ],
        };

        const [
          salesAgg,
          saleItems,
          incomeByCategory,
          expenseByCategory,
          salesByMethod,
          entriesByMethod,
          entriesNoMethod,
          refunds,
        ] = await Promise.all([
          prisma.sale.aggregate({
            _sum: { total: true },
            _count: true,
            where: whereDate,
          }),
          prisma.saleItem.findMany({
            where: { sale: whereDate },
            select: {
              quantity: true,
              product: { select: { cost: true } },
              sale: { select: { paymentMethodId: true } },
            },
          }),
          prisma.cashEntry.groupBy({
            by: ["category"],
            where: { type: "INCOME", ...whereEntryDate, ...cashMethodFilter },
            _sum: { amount: true },
          }),
          prisma.cashEntry.groupBy({
            by: ["category"],
            where: { type: { in: ["EXPENSE", "TRANSFER"] }, ...whereEntryDate, ...cashMethodFilter },
            _sum: { amount: true },
          }),
          prisma.sale.groupBy({
            by: ["paymentMethodId"],
            where: { ...whereDate, paymentMethodId: { not: null } },
            _sum: { total: true },
            _count: true,
          }),
          prisma.cashEntry.groupBy({
            by: ["paymentMethodId", "type"],
            where: { paymentMethodId: { not: null }, ...whereEntryDate },
            _sum: { amount: true },
          }),
          prisma.cashEntry.findMany({
            where: { paymentMethodId: null, ...whereEntryDate },
            select: { type: true, amount: true },
          }),
          prisma.refund.findMany({
            where: whereDate,
            select: {
              amount: true,
              quantity: true,
              product: { select: { cost: true } },
              sale: { select: { paymentMethodId: true } },
            },
          }),
        ]);

        const refundTotal = refunds.reduce((sum, r) => sum + r.amount, 0);
        const refundCost = refunds.reduce((sum, r) => sum + r.quantity * (r.product?.cost || 0), 0);
        const refundCount = refunds.length;

        const totalRevenue = Math.max(0, (salesAgg._sum.total || 0) - refundTotal);
        const totalCost = Math.max(0, saleItems.reduce(
          (sum, item) => sum + item.product.cost * item.quantity,
          0
        ) - refundCost);

        // Build category map
        const incomeByCat: Record<string, number> = {};
        for (const c of incomeByCategory) incomeByCat[c.category] = c._sum.amount || 0;
        const expenseByCat: Record<string, number> = {};
        for (const c of expenseByCategory) expenseByCat[c.category] = c._sum.amount || 0;

        // Caja: SOLO metodos que afectan caja (affectsCash) + entradas sin metodo.
        // Ventas con metodo que NO afecta caja (tarjeta, etc.) van a su apartado,
        // no a la caja fuerte.
        const pmById = new Map(paymentMethods.map((pm) => [pm.id, pm]));
        const affectsCashSet = new Set(affectsCashIds);

        let cashIncome = 0;
        let cashExpense = 0;
        for (const e of entriesNoMethod) {
          if (e.type === "INCOME") cashIncome += e.amount;
          else cashExpense += e.amount;
        }
        for (const e of entriesByMethod) {
          if (!e.paymentMethodId || !affectsCashSet.has(e.paymentMethodId)) continue;
          if (e.type === "INCOME") cashIncome += e._sum.amount || 0;
          else cashExpense += e._sum.amount || 0;
        }
        const cashBalance = cashIncome - cashExpense;

        // Ingresos/egresos por metodo (todas las entradas, sin importar affectsCash)
        const incomeByMethod: Record<number, number> = {};
        const expenseByMethod: Record<number, number> = {};
        for (const e of entriesByMethod) {
          if (!e.paymentMethodId) continue;
          if (e.type === "INCOME") incomeByMethod[e.paymentMethodId] = (incomeByMethod[e.paymentMethodId] || 0) + (e._sum.amount || 0);
          else expenseByMethod[e.paymentMethodId] = (expenseByMethod[e.paymentMethodId] || 0) + (e._sum.amount || 0);
        }

        // Costo y ventas por metodo
        const costByMethod: Record<number, number> = {};
        for (const item of saleItems) {
          if (item.sale.paymentMethodId) {
            costByMethod[item.sale.paymentMethodId] = (costByMethod[item.sale.paymentMethodId] || 0) + item.product.cost * item.quantity;
          }
        }
        // Los reembolsos revierten la venta en el apartado del método de pago
        for (const r of refunds) {
          const pmId = r.sale?.paymentMethodId;
          if (!pmId) continue;
          costByMethod[pmId] = Math.max(0, (costByMethod[pmId] || 0) - r.quantity * (r.product?.cost || 0));
        }
        const revenueByMethod: Record<number, number> = {};
        const countByMethod: Record<number, number> = {};
        for (const s of salesByMethod) {
          if (s.paymentMethodId) {
            revenueByMethod[s.paymentMethodId] = s._sum.total || 0;
            countByMethod[s.paymentMethodId] = s._count;
          }
        }
        for (const r of refunds) {
          const pmId = r.sale?.paymentMethodId;
          if (!pmId) continue;
          revenueByMethod[pmId] = Math.max(0, (revenueByMethod[pmId] || 0) - r.amount);
        }

        // Reglas del usuario:
        // - El ingreso SIEMPRE entra como ganancia neta (los depositos manuales suman).
        // - Las compras de mercancía (purchase) descuentan PRIMERO del costo
        //   total y el excedente (si superan el costo de lo vendido) sale de
        //   las ganancias.
        // - Las piezas extras recibidas (extra_purchase) descuentan SOLO de la
        //   ganancia neta, igual que los retiros de ganancias.
        // - Los demás egresos (operativos, otros, transferencias, retiros mixtos)
        //   retiran PRIMERO de la ganancia neta y despues del costo total.
        const manualIncome = (incomeByCat["manual_deposit"] || 0) + (incomeByCat["other"] || 0);
        const profitWithdrawn =
          (expenseByCat["profit_withdrawal"] || 0) + (expenseByCat["extra_purchase"] || 0);
        const combinedExpenses =
          (expenseByCat["profit_cost_withdrawal"] || 0) +
          (expenseByCat["operating_expense"] || 0) +
          (expenseByCat["other"] || 0) +
          (expenseByCat["transfer"] || 0);

        const grossProfit = totalRevenue - totalCost;
        const profitBase = grossProfit + manualIncome;
        const remainingProfit = profitBase - profitWithdrawn;
        const purchaseTotal = expenseByCat["purchase"] || 0;
        const purchaseFromCost = Math.min(purchaseTotal, Math.max(0, totalCost));
        const purchaseExcess = Math.max(0, purchaseTotal - purchaseFromCost);
        const profitFromPurchaseExcess = Math.min(purchaseExcess, Math.max(0, remainingProfit));
        const profitFromCombined = Math.min(combinedExpenses, Math.max(0, remainingProfit - profitFromPurchaseExcess));
        const costFromCombined = Math.max(0, combinedExpenses - profitFromCombined);

        const netProfit =
          profitBase - profitWithdrawn - profitFromPurchaseExcess - profitFromCombined;
        const netCost = totalCost - purchaseFromCost - costFromCombined;
        const effectiveRevenue = netProfit + netCost;

        // Apartado por metodo de pago: ventas, costo total, ganancia neta y disponible
        const byPaymentMethod = paymentMethods.map((pm) => {
          const revenue = revenueByMethod[pm.id] || 0;
          const cost = costByMethod[pm.id] || 0;
          const available = (incomeByMethod[pm.id] || 0) - (expenseByMethod[pm.id] || 0);
          return {
            id: pm.id,
            name: pm.name,
            affectsCash: pm.affectsCash,
            sales: {
              count: countByMethod[pm.id] || 0,
              revenue,
              totalCost: cost,
              profit: revenue - cost,
            },
            available,
          };
        });

        return Response.json({
          period: { from: from || "all", to: to || "all" },
          sales: {
            count: salesAgg._count,
            revenue: totalRevenue,
            totalCost,
            profit: netProfit,
            grossProfit,
            profitMargin: effectiveRevenue > 0 ? ((netProfit / effectiveRevenue) * 100).toFixed(1) : "0",
            refunded: {
              count: refundCount,
              amount: refundTotal,
              cost: refundCost,
            },
            withdrawn: {
              profitOnly: profitWithdrawn,
              profitFromCombined,
              costFromCombined,
              total: profitWithdrawn + combinedExpenses,
            },
            availableProfit: Math.max(0, netProfit),
            combinedAvailable: Math.max(0, profitBase - profitWithdrawn - combinedExpenses),
          },
          cash: {
            balance: cashBalance,
            incomeByCategory: incomeByCat,
            expenseByCategory: expenseByCat,
            incomeTotal: cashIncome,
            expenseTotal: cashExpense,
          },
          byPaymentMethod,
        });
      }

      case "product-breakdown": {
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
        const skip = (page - 1) * limit;
        const search = searchParams.get("q") || "";
        const deptId = searchParams.get("departmentId");
        const supplierId = searchParams.get("supplierId");
        const priceMin = searchParams.get("priceMin");
        const priceMax = searchParams.get("priceMax");
        const costMin = searchParams.get("costMin");
        const costMax = searchParams.get("costMax");
        const stockMin = searchParams.get("stockMin");
        const stockMax = searchParams.get("stockMax");
        const minStockMin = searchParams.get("minStockMin");
        const minStockMax = searchParams.get("minStockMax");
        const active = searchParams.get("active");

        const where: Record<string, unknown> = {};
        if (search) {
          where.OR = [
            { name: { contains: search } },
            { barcode: { contains: search } },
          ];
        }
        if (deptId && deptId !== "all") where.departmentId = parseInt(deptId);
        if (supplierId && supplierId !== "all") where.supplierId = parseInt(supplierId);
        if (priceMin) where.price = { ...(where.price as object || {}), gte: parseFloat(priceMin) };
        if (priceMax) where.price = { ...(where.price as object || {}), lte: parseFloat(priceMax) };
        if (costMin) where.cost = { ...(where.cost as object || {}), gte: parseFloat(costMin) };
        if (costMax) where.cost = { ...(where.cost as object || {}), lte: parseFloat(costMax) };
        if (stockMin) where.stock = { ...(where.stock as object || {}), gte: parseInt(stockMin) };
        if (stockMax) where.stock = { ...(where.stock as object || {}), lte: parseInt(stockMax) };
        if (minStockMin) where.minStock = { ...(where.minStock as object || {}), gte: parseInt(minStockMin) };
        if (minStockMax) where.minStock = { ...(where.minStock as object || {}), lte: parseInt(minStockMax) };
        if (active === "true") where.active = true;
        if (active === "false") where.active = false;

        const [products, total] = await Promise.all([
          prisma.product.findMany({
            where,
            select: {
              id: true,
              name: true,
              barcode: true,
              price: true,
              cost: true,
              stock: true,
              minStock: true,
              department: { select: { name: true } },
              supplier: { select: { name: true } },
            },
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
          minStock: p.minStock,
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
      EXPENSE: ["profit_withdrawal", "profit_cost_withdrawal", "operating_expense", "purchase", "extra_purchase", "other"],
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

    void logChange(getDeviceId(), "CREATE", "cashentry", entry.id, {
      id: entry.id,
      type: entry.type,
      category: entry.category,
      amount: entry.amount,
      description: entry.description,
      paymentMethodId: entry.paymentMethodId,
      userId: entry.userId,
      recordedAt: entry.recordedAt,
    });
    return Response.json(entry, { status: 201 });
  } catch (error) {
    console.error("Cash entry error:", error);
    return Response.json({ error: "Error al crear entrada de caja" }, { status: 500 });
  }
}
