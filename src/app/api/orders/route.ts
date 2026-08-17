import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { orderSchema } from "@/lib/validations";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp } from "@/lib/audit";
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

    const [orders, total] = await Promise.all([
      prisma.supplierOrder.findMany({
        select: {
          id: true,
          supplierId: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          sentAt: true,
          supplier: { select: { id: true, name: true, active: true } },
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              productBarcode: true,
              quantity: true,
              receivedQuantity: true,
              received: true,
              notes: true,
              product: {
                select: {
                  id: true, name: true, barcode: true, stock: true, active: true,
                  price: true, cost: true,
                  productLines: {
                    select: { supplierId: true, supplierPrice: true, isPrimary: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.supplierOrder.count(),
    ]);

    return Response.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + orders.length < total,
      },
    });
  } catch (error) {
    console.error("Error listing orders:", error);
    return Response.json({ error: "Error al obtener órdenes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = orderSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    await initializePrisma();
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const realItems = data.items.filter((i) => typeof i.productId === "number");
      const products = realItems.length > 0
        ? await tx.product.findMany({
            where: { id: { in: realItems.map((i) => i.productId as number) } },
            include: {
              productLines: {
                where: { supplierId: data.supplierId },
              },
            },
          })
        : [];
      const linesByProduct = new Map(
        products.map((p) => [
          p.id,
          p.productLines.find((l) => l.isPrimary) ?? p.productLines[0] ?? null,
        ])
      );

      const newOrder = await tx.supplierOrder.create({
        data: {
          supplierId: data.supplierId,
          notes: data.notes,
          status: data.status ?? "pending",
          items: {
            create: data.items.map((item) => {
              if (typeof item.productId === "number") {
                const line = linesByProduct.get(item.productId);
                const product = products.find((p) => p.id === item.productId);
                return {
                  productId: item.productId,
                  productName: product?.name ?? "",
                  productBarcode: product?.barcode ?? "",
                  quantity: item.quantity,
                  costPrice: line?.supplierPrice ?? product?.cost ?? 0,
                  // Gestión de cajas: la cantidad va en cajas
                  isBox: item.isBox === true ? true : undefined,
                  unitsPerBox: item.isBox === true ? item.unitsPerBox ?? null : undefined,
                };
              }
              // Producto fantasma: no existe en inventario, se guarda el snapshot
              return {
                productId: null,
                productName: (item.name ?? "").trim(),
                productBarcode: (item.barcode ?? "").trim(),
                quantity: item.quantity,
                costPrice: item.cost ?? 0,
                notes: `P. venta: ${item.price ?? 0}`,
              };
            }),
          },
        },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      // Gestión de cajas: el sobrante (piezas que no completaron una caja) se
      // acumula en el producto para tomarlo en el siguiente pedido.
      const remainderUpdates: Array<{ productId: number; boxRemainder: number }> = [];
      for (const item of data.items) {
        if (
          item.isBox === true &&
          typeof item.productId === "number" &&
          item.unitsPerBox &&
          item.newRemainder !== undefined
        ) {
          await tx.product.update({
            where: { id: item.productId },
            data: { boxRemainder: item.newRemainder },
          });
          remainderUpdates.push({ productId: item.productId, boxRemainder: item.newRemainder });
        }
      }

      return { newOrder, remainderUpdates };
    });

    for (const r of order.remainderUpdates) {
      void logChange(getDeviceId(), "UPDATE", "product", r.productId, {
        boxRemainder: r.boxRemainder,
      });
    }

    void logChange(getDeviceId(), "CREATE", "order", order.newOrder.id, {
      id: order.newOrder.id,
      supplierId: order.newOrder.supplierId,
      notes: order.newOrder.notes,
      items: data.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        barcode: i.barcode,
        price: i.price,
        cost: i.cost,
        quantity: i.quantity,
        isBox: i.isBox,
        unitsPerBox: i.unitsPerBox,
      })),
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "create",
      entity: "order",
      entityId: order.newOrder.id,
      description: `Pedido creado a ${order.newOrder.supplier?.name || 'proveedor'} (${data.items.length} productos)`,
      details: { supplierId: order.newOrder.supplierId, items: data.items.length },
      ip: getClientIp(request),
    });

    // Guardar el rango de fechas/horas usado para que el siguiente pedido a este
    // proveedor continúe donde terminó el anterior (el "hasta" de este pedido
    // pasa a ser el "desde" del próximo).
    if (data.range && (data.range.dateFrom || data.range.dateTo || data.range.timeFrom || data.range.timeTo)) {
      const key = `lastOrderRange_${data.supplierId}`;
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(data.range) },
        update: { value: JSON.stringify(data.range) },
      });
    }

    return Response.json(order.newOrder, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return Response.json({ error: "Error al crear orden" }, { status: 500 });
  }
}
