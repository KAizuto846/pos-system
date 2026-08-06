import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { saleSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import type { Prisma } from "@prisma/client";

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = positiveInt(searchParams.get("page"), 1);
    const limit = Math.min(positiveInt(searchParams.get("limit"), 50), 100);
    const skip = (page - 1) * limit;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const createdAt: { gte?: Date; lte?: Date } = {};

    if (startDate) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        return Response.json({ error: "startDate inválida" }, { status: 400 });
      }
      createdAt.gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) {
        return Response.json({ error: "endDate inválida" }, { status: 400 });
      }
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }

    const where = Object.keys(createdAt).length > 0 ? { createdAt } : {};
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: {
          id: true,
          total: true,
          discountTotal: true,
          paymentMethodId: true,
          userId: true,
          customerId: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              price: true,
              product: { select: { id: true, name: true, barcode: true } },
            },
          },
          paymentMethod: { select: { id: true, name: true } },
          user: { select: { name: true } },
          refunds: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              amount: true,
              reason: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return Response.json({
      sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + sales.length < total,
      },
    });
  } catch (error) {
    console.error("Error listing sales:", error);
    return Response.json({ error: "Error al obtener ventas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = saleSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const userId = parseInt(session.user.id, 10);

    await initializePrisma();
    const sale = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomic stock check + decrement using raw SQL
      // This prevents race conditions between concurrent sales
      for (const item of data.items) {
        const result = await tx.$executeRaw`
          UPDATE products SET stock = stock - ${item.quantity}
          WHERE id = ${item.productId} AND stock >= ${item.quantity}
        `;

        if (result === 0) {
          // Check if product exists to give a better error message
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, stock: true },
          });

          if (!product) {
            throw new Error(`Producto con ID ${item.productId} no encontrado`);
          }

          throw new Error(
            `Stock insuficiente para ${product.name}. Disponible: ${product.stock}, requerido: ${item.quantity}`
          );
        }
      }

      // Create the sale
      const newSale = await tx.sale.create({
        data: {
          total: data.total,
          discountTotal: data.discountTotal || 0,
          paymentMethodId: data.paymentMethodId,
          userId,
          customerId: data.customerId || null,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
          paymentMethod: true,
          user: {
            select: { name: true },
          },
        },
      });

      // Update customer loyalty stats
      if (data.customerId) {
        const customer = await tx.customer.update({
          where: { id: data.customerId },
          data: {
            purchaseCount: { increment: 1 },
            totalSpent: { increment: data.total },
            lastPurchaseAt: new Date(),
          },
        });

        // Update tier based on new purchase count
        const newCount = customer.purchaseCount;
        let newTier = "bronze";
        if (newCount >= 30) newTier = "gold";
        else if (newCount >= 10) newTier = "silver";

        if (newTier !== customer.tier) {
          await tx.customer.update({
            where: { id: data.customerId },
            data: { tier: newTier },
          });
        }
      }

      // Auto-create cash entry for this sale
      await tx.cashEntry.create({
        data: {
          type: "INCOME",
          category: "sales",
          amount: data.total,
          description: `Venta #${newSale.id}`,
          saleId: newSale.id,
          paymentMethodId: data.paymentMethodId,
          userId,
        },
      });

      return newSale;
    });

    broadcast("sale:create", { id: sale.id, total: sale.total });
    return Response.json(sale, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear venta";
    console.error("Error creating sale:", error);

    if (message.includes("no encontrado") || message.includes("insuficiente")) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: "Error al crear venta" }, { status: 500 });
  }
}
