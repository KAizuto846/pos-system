import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { saleSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { consumeBatch } from "@/lib/stock";
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
    const openedPieces: Array<{
      boxId: number;
      pieceId: number;
      pieces: number;
      logId: number;
      createdAt: Date;
    }> = [];

    // Desglose del impuesto para el ticket (se llenan dentro de la transacción)
    let taxBase = 0;
    let taxAmount = 0;
    let taxPercentage = 0;

    // Cobros realizados sin stock suficiente: se permite la venta pero se
    // registra cada producto que no tenia existencia para notificarlo.
    const stockShortages: Array<{
      productId: number;
      productName: string;
      quantitySold: number;
      stockBefore: number;
      stockAfter: number;
      shortage: number;
    }> = [];

    const sale = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomic stock check + decrement using raw SQL
      // This prevents race conditions between concurrent sales
      for (const item of data.items) {
        let result = await tx.$executeRaw`
          UPDATE products SET stock = stock - ${item.quantity}
          WHERE id = ${item.productId} AND stock >= ${item.quantity}
        `;

        if (result === 0 && Number.isInteger(item.productId)) {
          // Posible pieza con stock agotado: intentar abrir una caja automáticamente
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: {
              id: true,
              name: true,
              stock: true,
              pieceOfProductId: true,
              piecesPerUnit: true,
            },
          });

          if (product?.pieceOfProductId) {
            const box = await tx.product.findUnique({
              where: { id: product.pieceOfProductId },
              select: { id: true, stock: true, piecesPerUnit: true },
            });
            const pieces =
              box?.piecesPerUnit ?? product.piecesPerUnit ?? 0;
            if (box && box.stock >= 1 && pieces >= item.quantity) {
              const consumed = await tx.$executeRaw`
                UPDATE products SET stock = stock - 1
                WHERE id = ${box.id} AND stock >= 1
              `;
              if (consumed === 1) {
                await tx.$executeRaw`
                  UPDATE products SET stock = stock + ${pieces}
                  WHERE id = ${item.productId}
                `;
                const result2 = await tx.$executeRaw`
                  UPDATE products SET stock = stock - ${item.quantity}
                  WHERE id = ${item.productId} AND stock >= ${item.quantity}
                `;
                if (result2 === 1) {
                  const log = await tx.piecesLog.create({
                    data: {
                      boxProductId: box.id,
                      pieces,
                      source: "sale",
                    },
                  });
                  openedPieces.push({
                    boxId: box.id,
                    pieceId: item.productId,
                    pieces,
                    logId: log.id,
                    createdAt: log.createdAt,
                  });
                  result = 1;
                } else {
                  // Stock de pieza aún insuficiente: devolver la caja
                  await tx.$executeRaw`
                    UPDATE products SET stock = stock + 1 WHERE id = ${box.id}
                  `;
                }
              }
            }
          }
        }

        if (result === 0) {
          // Sin stock suficiente: SE PERMITE el cobro (el stock queda negativo o
          // en cero) pero se registra la alerta para notificarlo.
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, stock: true },
          });

          if (!product) {
            throw new Error(`Producto con ID ${item.productId} no encontrado`);
          }

          const stockBefore = product.stock;
          await tx.$executeRaw`
            UPDATE products SET stock = stock - ${item.quantity}
            WHERE id = ${item.productId}
          `;
          stockShortages.push({
            productId: item.productId,
            productName: product.name,
            quantitySold: item.quantity,
            stockBefore,
            stockAfter: stockBefore - item.quantity,
            shortage: Math.max(item.quantity - Math.max(stockBefore, 0), 0),
          });
        }

        // Consume batches FIFO by expiration (stock total already decremented above)
        await consumeBatch(tx, item.productId, item.quantity);
      }

      // Impuesto/recargo por horario: el servidor es la fuente de verdad.
      // Si esta activo, cobra ceil(precio * (1 + pct/100)) y recalcula el total.
      const { getTaxRule, applyTaxToPrice, taxMatchesScope, isTaxActive } = await import("@/lib/tax-rule");
      const taxRule = await getTaxRule();
      const taxActive = Boolean(taxRule && isTaxActive(taxRule) && taxRule.percentage > 0);
      const taxedPrices: Record<number, number> = {};
      let recomputedTotal = 0;
      if (taxActive && taxRule) {
        const productIds = data.items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, supplierId: true, departmentId: true, price: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        taxPercentage = taxRule.percentage;
        for (const item of data.items) {
          const prod = productMap.get(item.productId);
          const base = prod?.price ?? item.price;
          const matches = prod
            ? taxMatchesScope(taxRule, { supplierId: prod.supplierId, departmentId: prod.departmentId, price: prod.price })
            : false;
          const finalPrice = matches ? applyTaxToPrice(taxRule, base) : base;
          taxedPrices[item.productId] = finalPrice;
          taxBase += base * item.quantity;
          recomputedTotal += finalPrice * item.quantity;
        }
        taxAmount = recomputedTotal - taxBase;
        recomputedTotal -= data.discountTotal || 0;
      }

      // Create the sale
      const newSale = await tx.sale.create({
        data: {
          total: taxActive ? recomputedTotal : data.total,
          discountTotal: data.discountTotal || 0,
          paymentMethodId: data.paymentMethodId,
          userId,
          customerId: data.customerId || null,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: taxActive ? taxedPrices[item.productId] : item.price,
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
    void logChange(getDeviceId(), "CREATE", "sale", sale.id, {
      id: sale.id,
      total: sale.total,
      discountTotal: sale.discountTotal,
      paymentMethodId: sale.paymentMethodId,
      userId: sale.userId,
      customerId: sale.customerId,
      items: data.items,
      createdAt: sale.createdAt,
    });

    // Registrar los cobros sin existencia (la venta se permitio igualmente)
    const createdStockAlerts = [];
    for (const s of stockShortages) {
      const alert = await prisma.stockAlert.create({
        data: {
          saleId: sale.id,
          productId: s.productId,
          productName: s.productName,
          quantitySold: s.quantitySold,
          stockBefore: s.stockBefore,
          stockAfter: s.stockAfter,
          shortage: s.shortage,
          status: "pending",
        },
      });
      createdStockAlerts.push(alert);
      void logChange(getDeviceId(), "CREATE", "stockalert", alert.id, {
        saleId: sale.id,
        productId: s.productId,
        productName: s.productName,
        quantitySold: s.quantitySold,
        stockBefore: s.stockBefore,
        stockAfter: s.stockAfter,
        shortage: s.shortage,
        status: "pending",
      });
    }
    if (createdStockAlerts.length > 0) {
      broadcast("stock-alert:change", { count: createdStockAlerts.length });
    }

    for (const opened of openedPieces) {
      const freshBox = await prisma.product.findUnique({
        where: { id: opened.boxId },
        select: {
          id: true,
          name: true,
          barcode: true,
          price: true,
          cost: true,
          stock: true,
          minStock: true,
          active: true,
          departmentId: true,
          supplierId: true,
          piecesPerUnit: true,
          piecesTracked: true,
        },
      });
      const freshPiece = await prisma.product.findUnique({
        where: { id: opened.pieceId },
        select: {
          id: true,
          name: true,
          barcode: true,
          price: true,
          cost: true,
          stock: true,
          minStock: true,
          active: true,
          departmentId: true,
          supplierId: true,
          pieceOfProductId: true,
        },
      });
      broadcast("product:stock", { id: opened.boxId, stock: freshBox?.stock });
      if (freshBox) {
        const boxPatch = { ...freshBox } as Partial<typeof freshBox>;
        delete boxPatch.id;
        void logChange(getDeviceId(), "UPDATE", "product", opened.boxId, boxPatch);
      }
      if (freshPiece) {
        const piecePatch = { ...freshPiece } as Partial<typeof freshPiece>;
        delete piecePatch.id;
        void logChange(getDeviceId(), "UPDATE", "product", opened.pieceId, piecePatch);
      }
      void logChange(getDeviceId(), "CREATE", "pieceslog", opened.logId, {
        id: opened.logId,
        boxProductId: opened.boxId,
        pieces: opened.pieces,
        source: "sale",
        createdAt: opened.createdAt.toISOString(),
      });
    }
    return Response.json(
      {
        ...sale,
        taxBase,
        taxAmount,
        taxPercentage,
        stockAlerts: createdStockAlerts.map((a) => ({
          id: a.id,
          productName: a.productName,
          quantitySold: a.quantitySold,
          shortage: a.shortage,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al crear venta";
    console.error("Error creating sale:", error);

    if (message.includes("no encontrado") || message.includes("insuficiente")) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: "Error al crear venta" }, { status: 500 });
  }
}
