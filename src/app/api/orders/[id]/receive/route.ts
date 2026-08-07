import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { addStock, monthYearToEndOfMonth } from "@/lib/stock";
import type { Prisma } from "@prisma/client";

interface ReceiveItem {
  orderItemId: number;
  receivedQuantity: number;
  expiresAt?: string | null;
  costPrice?: number | null;
  price?: number | null;
}

interface ExtraItem {
  productId: number;
  quantity: number;
  costPrice?: number | null;
  price?: number | null;
  expiresAt?: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const items: ReceiveItem[] = body.items || [];
    const extras: ExtraItem[] = body.extras || [];

    if (items.length === 0 && extras.length === 0) {
      return Response.json(
        { error: "Debe proporcionar al menos un item recibido" },
        { status: 400 }
      );
    }

    const order = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        supplier: true,
      },
    });

    if (!order) {
      return Response.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    if (order.status === "received" || order.status === "cancelled") {
      return Response.json(
        { error: `La orden ya está ${order.status === "received" ? "recibida" : "cancelada"}` },
        { status: 400 }
      );
    }

    // Precios por producto (línea del proveedor actual) para defaults
    const products = await prisma.product.findMany({
      where: {
        id: {
          in: [
            ...items.map((i) => order.items.find((oi) => oi.id === i.orderItemId)?.productId),
            ...extras.map((e) => e.productId),
          ].filter((x): x is number => typeof x === "number"),
        },
      },
      include: {
        productLines: { where: { supplierId: order.supplierId } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const defaultCost = (productId: number) =>
      productMap.get(productId)?.productLines.find((l) => l.isPrimary)?.supplierPrice ??
      productMap.get(productId)?.productLines[0]?.supplierPrice ??
      productMap.get(productId)?.cost ??
      0;

    let purchaseCost = 0;
    let extraCost = 0;

    await initializePrisma();
    const updatedOrder = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of items) {
        const { orderItemId, receivedQuantity } = item;

        if (typeof receivedQuantity !== "number" || receivedQuantity < 0) {
          throw new Error(`Cantidad recibida inválida para el item ${orderItemId}`);
        }

        const orderItem = order.items.find((oi) => oi.id === orderItemId);
        if (!orderItem) {
          throw new Error(`Item de orden ${orderItemId} no encontrado`);
        }

        if (receivedQuantity > orderItem.quantity) {
          throw new Error(
            `Cantidad recibida (${receivedQuantity}) excede la cantidad ordenada (${orderItem.quantity}) para el producto`
          );
        }

        const finalCost =
          typeof item.costPrice === "number" && item.costPrice >= 0
            ? item.costPrice
            : orderItem.costPrice ?? defaultCost(orderItem.productId);

        // Si se cambiaron precios, actualizar el inventario (producto + línea del proveedor)
        if (typeof item.costPrice === "number" && item.costPrice >= 0) {
          await tx.productLine.updateMany({
            where: { productId: orderItem.productId, supplierId: order.supplierId },
            data: { supplierPrice: item.costPrice },
          });
          await tx.product.update({
            where: { id: orderItem.productId },
            data: { cost: item.costPrice },
          });
        }
        if (typeof item.price === "number" && item.price >= 0) {
          await tx.product.update({
            where: { id: orderItem.productId },
            data: { price: item.price },
          });
        }

        // Update the order item
        await tx.supplierOrderItem.update({
          where: { id: orderItemId },
          data: {
            receivedQuantity,
            received: receivedQuantity >= orderItem.quantity,
            costPrice: finalCost,
            notes: orderItem.notes,
          },
        });

        // Update product stock if received > 0 (en lote con caducidad opcional)
        if (receivedQuantity > 0) {
          const expiresAt = item.expiresAt ? monthYearToEndOfMonth(item.expiresAt) : null;
          await addStock(tx, orderItem.productId, receivedQuantity, {
            expiresAt,
            costPrice: finalCost,
          });
          purchaseCost += receivedQuantity * finalCost;
        }
      }

      // Piezas extras: productos que llegaron sin haberse pedido (se descuentan de ganancia)
      for (const extra of extras) {
        const { productId, quantity } = extra;
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error(`Cantidad inválida para producto extra ${productId}`);
        }
        const product = productMap.get(productId);
        if (!product) {
          throw new Error(`Producto extra ${productId} no encontrado`);
        }
        const finalCost =
          typeof extra.costPrice === "number" && extra.costPrice >= 0
            ? extra.costPrice
            : defaultCost(productId);

        await tx.supplierOrderItem.create({
          data: {
            supplierOrderId: orderId,
            productId,
            quantity,
            receivedQuantity: quantity,
            received: true,
            extra: true,
            costPrice: finalCost,
            notes: "Pieza extra",
          },
        });

        if (typeof extra.costPrice === "number" && extra.costPrice >= 0) {
          await tx.productLine.updateMany({
            where: { productId, supplierId: order.supplierId },
            data: { supplierPrice: extra.costPrice },
          });
          await tx.product.update({
            where: { id: productId },
            data: { cost: extra.costPrice },
          });
        }
        if (typeof extra.price === "number" && extra.price >= 0) {
          await tx.product.update({
            where: { id: productId },
            data: { price: extra.price },
          });
        }

        const expiresAt = extra.expiresAt ? monthYearToEndOfMonth(extra.expiresAt) : null;
        await addStock(tx, productId, quantity, { expiresAt, costPrice: finalCost });
        extraCost += quantity * finalCost;
      }

      // Determine overall order status
      const updatedItems = await tx.supplierOrderItem.findMany({
        where: { supplierOrderId: orderId },
      });

      const totalOrdered = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
      const totalReceived = updatedItems.reduce((sum, i) => sum + i.receivedQuantity, 0);

      let newStatus: string;
      if (totalReceived === 0) {
        newStatus = order.status === "sent" ? "sent" : "pending";
      } else if (totalReceived >= totalOrdered) {
        newStatus = "received";
      } else {
        newStatus = "partial";
      }

      const updatedOrder = await tx.supplierOrder.update({
        where: { id: orderId },
        data: { status: newStatus },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      return updatedOrder;
    });

    // Egresos en finanzas: lo recibido del pedido descuenta el costo total;
    // las piezas extras descuentan de la ganancia neta.
    if (purchaseCost > 0 || extraCost > 0) {
      const userId = parseInt(session.user.id, 10);
      const entries = [];
      if (purchaseCost > 0) {
        entries.push(
          prisma.cashEntry.create({
            data: {
              type: "EXPENSE",
              category: "purchase",
              amount: purchaseCost,
              description: `Compra pedido #${orderId} — ${order.supplier.name}`,
              userId,
            },
          })
        );
      }
      if (extraCost > 0) {
        entries.push(
          prisma.cashEntry.create({
            data: {
              type: "EXPENSE",
              category: "purchase",
              amount: extraCost,
              description: `Extras recibidas pedido #${orderId} — ${order.supplier.name}`,
              userId,
            },
          })
        );
      }
      await Promise.all(entries);
    }

    broadcast("order:receive", { id: orderId });
    void logChange(getDeviceId(), "CREATE", "order", orderId, {
      id: orderId,
      items,
      extras,
      status: updatedOrder.status,
    });
    return Response.json(updatedOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al recibir orden";
    console.error("Error receiving order:", error);

    if (
      message.includes("no encontrado") ||
      message.includes("excede") ||
      message.includes("inválida") ||
      message.includes("inválido")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: "Error al recibir orden" }, { status: 500 });
  }
}
