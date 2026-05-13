import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const saleId = parseInt(id, 10);

    if (isNaN(saleId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
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

    if (!sale) {
      return Response.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    return Response.json(sale);
  } catch (error) {
    console.error("Error getting sale:", error);
    return Response.json({ error: "Error al obtener venta" }, { status: 500 });
  }
}
