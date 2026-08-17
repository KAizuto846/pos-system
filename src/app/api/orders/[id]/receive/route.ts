import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { logAudit, getClientIp } from "@/lib/audit";
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
  productId: number | null;
  quantity: number;
  costPrice?: number | null;
  price?: number | null;
  expiresAt?: string | null;
  name?: string | null;
  barcode?: string | null;
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
    const paymentMethodId =
      typeof body.paymentMethodId === "number" ? body.paymentMethodId : null;
    const totalNote =
      typeof body.totalNote === "number" && body.totalNote >= 0 ? body.totalNote : null;

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
            : orderItem.costPrice ?? defaultCost(orderItem.productId ?? 0);

        // Si se cambiaron precios, actualizar el inventario (producto + línea del proveedor)
        if (typeof item.costPrice === "number" && item.costPrice >= 0 && orderItem.productId) {
          await tx.productLine.updateMany({
            where: { productId: orderItem.productId, supplierId: order.supplierId },
            data: { supplierPrice: item.costPrice },
          });
          await tx.product.update({
            where: { id: orderItem.productId },
            data: { cost: item.costPrice },
          });
        }
        if (typeof item.price === "number" && item.price >= 0 && orderItem.productId) {
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
          let productId = orderItem.productId;
          // Producto fantasma (no existía en inventario): se crea al recibir
          // con los datos rellenados, heredando el proveedor del pedido.
          if (!productId) {
            const barcodeBase = (orderItem.productBarcode || "").trim();
            const name = (orderItem.productName || "").trim() || `Producto pedido #${orderId}`;
            let barcode = barcodeBase || `F-${orderId}-${orderItem.id}`;
            const existingBarcode = await tx.product.findFirst({ where: { barcode } });
            if (existingBarcode) barcode = `${barcode}-${orderItem.id}`;
            const price = typeof item.price === "number" && item.price >= 0 ? item.price : 0;
            const created = await tx.product.create({
              data: {
                name,
                barcode,
                price,
                cost: finalCost,
                stock: 0,
                minStock: 1,
                active: true,
              },
            });
            void logChange(getDeviceId(), "CREATE", "product", created.id, {
              id: created.id,
              name,
              barcode,
              price,
              cost: finalCost,
              stock: 0,
              minStock: 1,
              active: true,
            });
            await tx.productLine.create({
              data: {
                productId: created.id,
                supplierId: order.supplierId,
                supplierPrice: finalCost,
                isPrimary: true,
              },
            });
            await tx.supplierOrderItem.update({
              where: { id: orderItemId },
              data: { productId: created.id },
            });
            productId = created.id;
          }
          // Gestión de cajas: la cantidad recibida está en cajas; al stock entran
          // las piezas reales (cajas × piezas por caja) y el costo se calcula por pieza.
          const unitMultiplier =
            orderItem.isBox === true && orderItem.unitsPerBox ? orderItem.unitsPerBox : 1;
          const expiresAt = item.expiresAt ? monthYearToEndOfMonth(item.expiresAt) : null;
          await addStock(tx, productId, receivedQuantity * unitMultiplier, {
            expiresAt,
            costPrice: finalCost,
          });
          purchaseCost += receivedQuantity * unitMultiplier * finalCost;
        }
      }

      // Piezas extras: productos que llegaron sin haberse pedido (se descuentan de ganancia)
      for (const extra of extras) {
        const { quantity } = extra;
        let { productId } = extra;
        const isGhost = !productId;
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error(`Cantidad inválida para producto extra`);
        }
        // Extra sin inventario (fantasma): se crea el producto al recibir
        if (!productId) {
          const name = (extra.name || "").trim();
          if (!name) {
            throw new Error("El producto extra sin inventario debe tener nombre");
          }
          const barcodeBase = (extra.barcode || "").trim() || `FX-${orderId}-${Date.now()}`;
          let barcode = barcodeBase;
          const existingBarcode = await tx.product.findFirst({ where: { barcode } });
          if (existingBarcode) barcode = `${barcode}-${existingBarcode.id}`;
          const price = typeof extra.price === "number" && extra.price >= 0 ? extra.price : 0;
          const ghostCost =
            typeof extra.costPrice === "number" && extra.costPrice >= 0
              ? extra.costPrice
              : 0;
          const created = await tx.product.create({
            data: {
              name,
              barcode,
              price,
              cost: ghostCost,
              stock: 0,
              minStock: 1,
              active: true,
            },
          });
          void logChange(getDeviceId(), "CREATE", "product", created.id, {
            id: created.id,
            name,
            barcode,
            price,
            cost: ghostCost,
            stock: 0,
            minStock: 1,
            active: true,
          });
          await tx.productLine.create({
            data: {
              productId: created.id,
              supplierId: order.supplierId,
              supplierPrice: ghostCost,
              isPrimary: true,
            },
          });
          productId = created.id;
        }
        if (!isGhost) {
          const existing = productMap.get(productId);
          if (!existing) {
            throw new Error(`Producto extra ${productId} no encontrado`);
          }
        }
        const finalCost =
          typeof extra.costPrice === "number" && extra.costPrice >= 0
            ? extra.costPrice
            : isGhost
              ? 0
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

    // Egresos en finanzas: el costo de las piezas del pedido descuenta del costo
    // total (categoría purchase); las piezas extras descuentan SOLO de la
    // ganancia neta (categoría extra_purchase). Si el usuario indicó el total de
    // la nota pagada, ese monto describe la compra de las piezas del pedido.
    const noteAmount = totalNote !== null ? totalNote : purchaseCost;
    if (noteAmount > 0 || extraCost > 0) {
      const userId = parseInt(session.user.id, 10);
      const entries = [];
      if (noteAmount > 0) {
        entries.push(
          prisma.cashEntry.create({
            data: {
              type: "EXPENSE",
              category: "purchase",
              amount: noteAmount,
              description: `Compra pedido #${orderId} — ${order.supplier.name}${
                totalNote !== null ? ` (nota: $${totalNote.toFixed(2)})` : ""
              }`,
              userId,
              paymentMethodId,
            },
          })
        );
      }
      if (extraCost > 0) {
        entries.push(
          prisma.cashEntry.create({
            data: {
              type: "EXPENSE",
              category: "extra_purchase",
              amount: extraCost,
              description: `Extras recibidas pedido #${orderId} — ${order.supplier.name}`,
              userId,
              paymentMethodId,
            },
          })
        );
      }
      await Promise.all(entries);
    }

    // Alerta de llegada: si el pedido recibido contiene algo de la lista de un
    // cliente, se crea/actualiza un aviso pendiente que no desaparece hasta
    // que alguien lo confirme (ver /api/delivery-notices).
    try {
      const receivedItems = updatedOrder.items.filter((i) => i.receivedQuantity > 0);
      const receivedProductIds = new Set(
        receivedItems.map((i) => i.productId).filter((x): x is number => typeof x === "number")
      );
      const wishlist = await prisma.customerWishlistItem.findMany({
        include: { customer: { select: { name: true, active: true } } },
      });
      const byCustomer = new Map<number, { customerId: number; customerName: string; items: { name: string; quantity: number }[] }>();
      for (const w of wishlist) {
        let matched: { name: string; quantity: number } | null = null;
        if (w.productId && receivedProductIds.has(w.productId)) {
          const prod = receivedItems.find((i) => i.productId === w.productId);
          matched = {
            name: prod?.product?.name ?? w.name ?? `Producto #${w.productId}`,
            quantity: prod?.receivedQuantity ?? 0,
          };
        } else if (w.productId === null && w.name.trim()) {
          const wanted = w.name.trim().toLowerCase();
          const prod = receivedItems.find((i) => {
            const n = (i.product?.name || i.productName || "").toLowerCase();
            return n.includes(wanted) || wanted.includes(n);
          });
          if (prod) {
            matched = {
              name: prod.product?.name || prod.productName || w.name,
              quantity: prod.receivedQuantity,
            };
          }
        }
        if (matched) {
          const entry = byCustomer.get(w.customerId) || {
            customerId: w.customerId,
            customerName: w.customer.name,
            items: [],
          };
          entry.items.push({ name: matched.name, quantity: matched.quantity });
          byCustomer.set(w.customerId, entry);
        }
      }
      for (const [, entry] of byCustomer) {
        const existing = await prisma.deliveryNotice.findFirst({
          where: { orderId, customerId: entry.customerId, status: "pending" },
        });
        const itemsJson = JSON.stringify(entry.items);
        if (existing) {
          await prisma.deliveryNotice.update({
            where: { id: existing.id },
            data: { items: itemsJson },
          });
        } else {
          const created = await prisma.deliveryNotice.create({
            data: {
              orderId,
              customerId: entry.customerId,
              items: itemsJson,
              status: "pending",
            },
          });
          void logChange(getDeviceId(), "CREATE", "deliverynotice", created.id, {
            orderId,
            customerId: entry.customerId,
            items: entry.items,
            status: "pending",
          });
        }
      }
    } catch (e) {
      console.error("[notice] Error creando avisos de llegada:", e);
    }

    broadcast("order:receive", { id: orderId });
    void logChange(getDeviceId(), "CREATE", "order", orderId, {
      id: orderId,
      items,
      extras,
      paymentMethodId,
      totalNote,
      status: updatedOrder.status,
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "receive",
      entity: "order",
      entityId: orderId,
      description: `Pedido #${orderId} recibido (${updatedOrder.supplier?.name || 'proveedor'})`,
      details: { items: items?.length || 0, extras: extras?.length || 0, status: updatedOrder.status },
      ip: getClientIp(request),
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
