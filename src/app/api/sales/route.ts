import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saleSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const sales = await prisma.sale.findMany({
      include: {
        items: {
          include: { product: true },
        },
        paymentMethod: true,
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(sales);
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

    const sale = await prisma.$transaction(async (tx) => {
      // Verify stock for all products
      for (const item of data.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Producto con ID ${item.productId} no encontrado`);
        }

        if (product.stock < item.quantity) {
          throw new Error(
            `Stock insuficiente para ${product.name}. Disponible: ${product.stock}, requerido: ${item.quantity}`
          );
        }
      }

      // Create the sale
      const newSale = await tx.sale.create({
        data: {
          total: data.total,
          paymentMethodId: data.paymentMethodId,
          userId,
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

      // Decrement stock for each product
      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return newSale;
    });

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
