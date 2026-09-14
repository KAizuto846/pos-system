import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Avisos de llegada pendientes (los confirmados se ocultan)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const notices = await prisma.deliveryNotice.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        order: {
          select: {
            id: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    return Response.json({
      notices: notices.map((n) => ({
        id: n.id,
        orderId: n.orderId,
        supplierName: n.order.supplier?.name || "—",
        customerName: n.customer?.name || "—",
        items: (() => {
          try {
            return JSON.parse(n.items);
          } catch {
            return [];
          }
        })(),
        createdAt: n.createdAt,
      })),
      count: notices.length,
    });
  } catch (error) {
    console.error("Error listing delivery notices:", error);
    return Response.json({ error: "Error al obtener avisos" }, { status: 500 });
  }
}