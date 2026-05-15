import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refundSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = refundSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const userId = parseInt(session.user.id, 10);

    const refund = await prisma.$transaction(async (tx) => {
      // Verify the sale exists
      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: {
          items: {
            where: { productId: data.productId },
          },
        },
      });

      if (!sale) {
        throw new Error("Venta no encontrada");
      }

      // Verify the product was in the sale
      const saleItem = sale.items[0];
      if (!saleItem) {
        throw new Error("El producto no pertenece a esta venta");
      }

      // Calculate already refunded quantity for this product in this sale
      const existingRefunds = await tx.refund.findMany({
        where: {
          saleId: data.saleId,
          productId: data.productId,
        },
      });

      const alreadyRefunded = existingRefunds.reduce(
        (sum, r) => sum + r.quantity,
        0
      );
      const availableToRefund = saleItem.quantity - alreadyRefunded;

      if (data.quantity > availableToRefund) {
        throw new Error(
          `Cantidad excede lo disponible para reembolso. Disponible: ${availableToRefund}, solicitado: ${data.quantity}`
        );
      }

      // Verify the product exists and get its current stock
      const product = await tx.product.findUnique({
        where: { id: data.productId },
      });

      if (!product) {
        throw new Error("Producto no encontrado");
      }

      // Create the refund record
      const newRefund = await tx.refund.create({
        data: {
          saleId: data.saleId,
          productId: data.productId,
          quantity: data.quantity,
          amount: data.amount,
          reason: data.reason,
          userId,
        },
        include: {
          product: {
            select: { id: true, name: true, price: true },
          },
          user: {
            select: { id: true, name: true },
          },
          sale: {
            select: { id: true, total: true },
          },
        },
      });

      // Restore product stock
      await tx.product.update({
        where: { id: data.productId },
        data: { stock: { increment: data.quantity } },
      });

      // Create cash entry for the refund (expense)
      await tx.cashEntry.create({
        data: {
          type: "EXPENSE",
          category: "refund",
          amount: data.amount,
          description: `Reembolso Venta #${data.saleId} - ${product.name} x${data.quantity}`,
          saleId: data.saleId,
          userId,
        },
      });

      return newRefund;
    });

    return Response.json(refund, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al procesar reembolso";
    console.error("Error creating refund:", error);

    if (
      message.includes("no encontrada") ||
      message.includes("no pertenece") ||
      message.includes("excede lo disponible") ||
      message.includes("no encontrado")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: "Error al procesar reembolso" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get("saleId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};

    // Admin sees all, cashier sees only their own
    if (session.user.role !== "ADMIN") {
      where.userId = parseInt(session.user.id, 10);
    }

    if (saleId) {
      where.saleId = parseInt(saleId, 10);
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59.999Z");
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    const refunds = await prisma.refund.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, barcode: true },
        },
        user: {
          select: { id: true, name: true },
        },
        sale: {
          select: { id: true, total: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(refunds);
  } catch (error) {
    console.error("Error listing refunds:", error);
    return Response.json({ error: "Error al obtener reembolsos" }, { status: 500 });
  }
}
