import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Avisos de cobro sin existencia pendientes (los reconocidos se ocultan)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const alerts = await prisma.stockAlert.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        sale: { select: { id: true, createdAt: true, total: true } },
        product: { select: { id: true, name: true, barcode: true } },
      },
    });

    return Response.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        saleId: a.saleId,
        saleCreatedAt: a.sale?.createdAt || a.createdAt,
        productId: a.productId,
        productName: a.productName,
        quantitySold: a.quantitySold,
        stockBefore: a.stockBefore,
        stockAfter: a.stockAfter,
        shortage: a.shortage,
        createdAt: a.createdAt,
      })),
      count: alerts.length,
    });
  } catch (error) {
    console.error("Error listing stock alerts:", error);
    return Response.json({ error: "Error al obtener avisos" }, { status: 500 });
  }
}
