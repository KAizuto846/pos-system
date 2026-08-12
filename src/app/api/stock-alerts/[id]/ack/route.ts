import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

export const dynamic = "force-dynamic";

// Reconocer un aviso de cobro sin existencia (ya no se muestra).
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
    const alertId = parseInt(id, 10);
    if (isNaN(alertId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const alert = await prisma.stockAlert.findUnique({ where: { id: alertId } });
    if (!alert) {
      return Response.json({ error: "Aviso no encontrado" }, { status: 404 });
    }
    if (alert.status === "acked") {
      return Response.json(alert);
    }

    const updated = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        status: "acked",
        ackedBy: parseInt(session.user.id, 10),
        ackedAt: new Date(),
      },
    });

    void logChange(getDeviceId(), "UPDATE", "stockalert", alertId, {
      status: "acked",
      ackedAt: updated.ackedAt?.toISOString(),
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Error acking stock alert:", error);
    return Response.json({ error: "Error al reconocer el aviso" }, { status: 500 });
  }
}
