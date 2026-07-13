import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";

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

    // Atomic stock update using raw SQL
    // This prevents race conditions between concurrent adjustments
    let result: number;
    if (quantity < 0) {
      // Decreasing stock: only succeed if there's enough
      result = await prisma.$executeRaw`
        UPDATE products SET stock = stock + ${quantity}
        WHERE id = ${productId} AND stock >= ${-quantity}
      `;
    } else {
      // Increasing stock: always succeeds
      result = await prisma.$executeRaw`
        UPDATE products SET stock = stock + ${quantity}
        WHERE id = ${productId}
      `;
    }

    if (result === 0) {
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true, stock: true },
      });

      if (!product) {
        return Response.json({ error: "Producto no encontrado" }, { status: 404 });
      }

      return Response.json(
        { error: "Stock insuficiente. El stock no puede ser negativo." },
        { status: 400 }
      );
    }

    const updated = await prisma.product.findUnique({
      where: { id: productId },
      include: { department: true, supplier: true },
    });

    broadcast("product:stock", { id: productId, stock: updated!.stock });
    return Response.json(updated);
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return Response.json({ error: "Error al ajustar stock" }, { status: 500 });
  }
}
