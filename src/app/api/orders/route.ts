import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const orders = await prisma.supplierOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(orders);
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

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.supplierOrder.create({
        data: {
          supplierId: data.supplierId,
          notes: data.notes,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
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

    return Response.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return Response.json({ error: "Error al crear orden" }, { status: 500 });
  }
}
