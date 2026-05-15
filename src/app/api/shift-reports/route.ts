import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
      if (dateFrom) {
        const start = new Date(dateFrom);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          dateFilter.gte = start;
        }
      }
      if (dateTo) {
        const end = new Date(dateTo);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
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
      return Response.json({ error: "Usuario inválido" }, { status: 400 });
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

    // Calculate sales for this user in the date range
    const sales = await prisma.sale.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
      include: {
        paymentMethod: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, s) => sum + s.total, 0);

    // Calculate refunds for this user in the date range
    const refunds = await prisma.refund.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
    });

    const totalRefunds = refunds.length;
    const refundAmount = refunds.reduce((sum, r) => sum + r.amount, 0);
    const netAmount = totalAmount - refundAmount;

    // Build payment method breakdown
    const pmMap: Record<string, { count: number; total: number }> = {};
    for (const sale of sales) {
      const name = sale.paymentMethod?.name || "Sin método";
      if (!pmMap[name]) {
        pmMap[name] = { count: 0, total: 0 };
      }
      pmMap[name].count++;
      pmMap[name].total += sale.total;
    }

    const byPaymentMethod = JSON.stringify(pmMap);

    // Create the shift report record
    const report = await prisma.shiftReport.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        totalSales,
        totalAmount,
        totalRefunds,
        refundAmount,
        netAmount,
        byPaymentMethod,
      },
    });

    return Response.json(report, { status: 201 });
  } catch (error) {
    console.error("Error creating shift report:", error);
    return Response.json(
      { error: "Error al generar reporte de turno" },
      { status: 500 }
    );
  }
}
