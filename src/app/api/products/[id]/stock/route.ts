import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { quantity } = body;

    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity === 0) {
      return Response.json(
        { error: "Cantidad inválida. Debe ser un número entero distinto de cero." },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const newStock = product.stock + quantity;

    if (newStock < 0) {
      return Response.json(
        { error: "Stock insuficiente. El stock no puede ser negativo." },
        { status: 400 }
      );
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock },
      include: { department: true, supplier: true },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return Response.json({ error: "Error al ajustar stock" }, { status: 500 });
  }
}
