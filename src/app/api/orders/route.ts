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

      return newOrder;
    });

    void logChange(getDeviceId(), "CREATE", "order", order.id, {
      id: order.id,
      supplierId: order.supplierId,
      notes: order.notes,
      items: data.items,
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "create",
      entity: "order",
      entityId: order.id,
      description: `Pedido creado a ${order.supplier?.name || 'proveedor'} (${data.items.length} productos)`,
      details: { supplierId: order.supplierId, items: data.items.length },
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

    return Response.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return Response.json({ error: "Error al crear orden" }, { status: 500 });
  }
}
