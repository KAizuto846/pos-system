import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = parseInt(session.user.id, 10);
    if (isNaN(userId)) {
      return Response.json({ error: "Usuario inválido" }, { status: 400 });
    }

    const role = session.user.role || "CASHIER";
    const { searchParams } = new URL(request.url);

    // Date filtering
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};

    // Apply user filter based on role
    if (role === "ADMIN") {
      const targetUserId = searchParams.get("userId");
      if (targetUserId && targetUserId !== "all" && targetUserId !== "") {
        where.userId = parseInt(targetUserId, 10);
      }
    } else {
      where.userId = userId;
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      // Fechas tipo "YYYY-MM-DD" se interpretan como día local completo
      const parseLocal = (value: string, endOfDay: boolean): Date | null => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const [y, m, d] = value.split("-").map(Number);
          return endOfDay
            ? new Date(y, m - 1, d, 23, 59, 59, 999)
            : new Date(y, m - 1, d, 0, 0, 0, 0);
        }
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      };
      if (dateFrom) {
        const start = parseLocal(dateFrom, false);
        if (start) dateFilter.gte = start;
      }
      if (dateTo) {
        const end = parseLocal(dateTo, true);
        if (end) dateFilter.lte = end;
      }
      if (Object.keys(dateFilter).length > 0) {
        where.startDate = dateFilter;
      }
    }

    const [reports, totalCount] = await Promise.all([
      prisma.shiftReport.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, username: true },
          },
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.shiftReport.count({ where }),
    ]);

    return Response.json({ reports, totalCount });
  } catch (error) {
    console.error("Error fetching shift reports:", error);
    return Response.json(
      { error: "Error al obtener reportes de turno" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = parseInt(session.user.id, 10);
    if (isNaN(userId)) {
      return Response.json({ error: "ID de usuario inválido: " + session.user.id }, { status: 400 });
    }

    const body = await request.json();
    const { startDate, endDate, preview } = body;

    if (!startDate || !endDate) {
      return Response.json(
        { error: "startDate y endDate son requeridos" },
        { status: 400 }
      );
    }

    // Fechas tipo "YYYY-MM-DD" se interpretan como día local completo;
    // si vienen con hora (ISO), se usan tal cual
    const parseDate = (value: string, endOfDay: boolean): Date => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        return endOfDay
          ? new Date(y, m - 1, d, 23, 59, 59, 999)
          : new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      return new Date(value);
    };

    const start = parseDate(startDate, false);
    const end = parseDate(endDate, true);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Response.json(
        { error: "Fechas inválidas: " + startDate + " - " + endDate },
        { status: 400 }
      );
    }

    // Calcular ventas para este usuario en el rango
    const sales = await prisma.sale.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
      include: {
        paymentMethod: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCost = sales.reduce(
      (sum, s) =>
        sum + s.items.reduce((sub, i) => sub + (i.quantity * (i.product?.cost || 0)), 0),
      0
    );

    // Reembolsos para este usuario en el rango
    const refunds = await prisma.refund.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
      include: { product: true, sale: true },
    });

    const totalRefunds = refunds.length;
    const refundAmount = refunds.reduce((sum, r) => sum + r.amount, 0);
    const netAmount = totalAmount - refundAmount;

    // Desglose por método de pago
    const pmMap: Record<string, { count: number; total: number; cashReceived: number; change: number }> = {};
    for (const sale of sales) {
      const name = sale.paymentMethod?.name || "Sin método";
      if (!pmMap[name]) {
        pmMap[name] = { count: 0, total: 0, cashReceived: 0, change: 0 };
      }
      pmMap[name].count++;
      pmMap[name].total += sale.total;
      pmMap[name].cashReceived += sale.cashReceived || 0;
      pmMap[name].change += sale.change || 0;
    }

    const byPaymentMethod = JSON.stringify(pmMap);

    // Desglose de productos vendidos
    const productsMap = new Map<
      number,
      { productId: number; name: string; barcode: string; quantity: number; price: number; cost: number }
    >();
    for (const sale of sales) {
      for (const item of sale.items) {
        const pid = item.productId;
        const existing = productsMap.get(pid);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          productsMap.set(pid, {
            productId: pid,
            name: item.product?.name || `#${pid}`,
            barcode: item.product?.barcode || "",
            quantity: item.quantity,
            price: item.price,
            cost: item.product?.cost || 0,
          });
        }
      }
    }

    // Desglose de ingresos/egresos (caja fuerte)
    const entries = await prisma.cashEntry.findMany({
      where: {
        userId,
        recordedAt: { gte: start, lte: end },
      },
      include: { paymentMethod: true },
      orderBy: { recordedAt: "asc" },
    });

    const entriesDetail = entries.map((e) => ({
      type: e.type,
      category: e.category,
      amount: e.amount,
      description: e.description,
      paymentMethod: e.paymentMethod?.name || null,
      recordedAt: e.recordedAt,
    }));

    const details = JSON.stringify({
      products: Array.from(productsMap.values()).sort((a, b) => b.quantity - a.quantity),
      entries: entriesDetail,
      refunds: refunds.map((r) => ({
        amount: r.amount,
        quantity: r.quantity,
        reason: r.reason,
        productName: r.product?.name || null,
        saleId: r.saleId,
        createdAt: r.createdAt,
      })),
    });

    const data = {
      userId,
      startDate: start,
      endDate: end,
      totalSales,
      totalAmount,
      totalCost,
      totalRefunds,
      refundAmount,
      netAmount,
      byPaymentMethod,
      details,
    };

    // Vista previa: calcula el resumen SIN guardar/actualizar el reporte.
    // El usuario ve los datos antes de confirmar el corte de turno.
    if (preview) {
      return Response.json(data, { status: 200 });
    }

    // Evitar duplicados: un reporte por usuario y dia de turno (startDate).
    // "Cerrar Turno" envia endDate = momento actual (cambia en cada click),
    // por eso ya no se compara el endDate: se actualiza el reporte del dia.
    const existing = await prisma.shiftReport.findFirst({
      where: {
        userId,
        startDate: start,
      },
    });

    let report;
    if (existing) {
      report = await prisma.shiftReport.update({
        where: { id: existing.id },
        data,
      });
    } else {
      try {
        report = await prisma.shiftReport.create({ data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const fresh = await prisma.shiftReport.findFirst({ where: { userId, startDate: start } });
          if (!fresh) throw e;
          report = await prisma.shiftReport.update({
            where: { id: fresh.id },
            data,
          });
        } else {
          throw e;
        }
      }
    }

    return Response.json(report, { status: 201 });
  } catch (error) {
    console.error("Error creating shift report:", error);
    return Response.json(
      { error: "Error al generar reporte de turno" },
      { status: 500 }
    );
  }
}
