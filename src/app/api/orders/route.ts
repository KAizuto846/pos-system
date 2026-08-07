import { auth } from "@/lib/auth";
import { initializePrisma, prisma } from "@/lib/db";
import { orderSchema } from "@/lib/validations";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
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
      const products = await tx.product.findMany({
        where: { id: { in: data.items.map((i) => i.productId) } },
        include: {
          productLines: {
            where: { supplierId: data.supplierId },
          },
        },
      });
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
          items: {
            create: data.items.map((item) => {
              const line = linesByProduct.get(item.productId);
              const product = products.find((p) => p.id === item.productId);
              return {
                productId: item.productId,
                quantity: item.quantity,
                costPrice: line?.supplierPrice ?? product?.cost ?? 0,
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
    return Response.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return Response.json({ error: "Error al crear orden" }, { status: 500 });
  }
}
