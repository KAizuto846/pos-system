import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/orders/last-range?supplierId=1
// Devuelve el último rango de fechas/horas usado al hacer un pedido a ese
// proveedor, para que el nuevo pedido continúe donde terminó el anterior.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    if (!supplierId) {
      return Response.json({ range: null });
    }

    const row = await prisma.appSetting.findUnique({
      where: { key: `lastOrderRange_${supplierId}` },
    });

    if (!row) {
      return Response.json({ range: null });
    }

    try {
      return Response.json({ range: JSON.parse(row.value) });
    } catch {
      return Response.json({ range: null });
    }
  } catch (error) {
    console.error("Error getting last order range:", error);
    return Response.json({ error: "Error al obtener el último rango" }, { status: 500 });
  }
}
