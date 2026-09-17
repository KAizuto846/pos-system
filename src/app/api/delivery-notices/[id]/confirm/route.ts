import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

export const dynamic = "force-dynamic";

// Confirmar que el pedido de la persona ya llegó → el aviso desaparece.
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
    const noticeId = parseInt(id, 10);
    if (isNaN(noticeId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const notice = await prisma.deliveryNotice.findUnique({
      where: { id: noticeId },
    });
    if (!notice) {
      return Response.json({ error: "Aviso no encontrado" }, { status: 404 });
    }
    if (notice.status === "confirmed") {
      return Response.json(notice);
    }

    const updated = await prisma.deliveryNotice.update({
      where: { id: noticeId },
      data: {
        status: "confirmed",
        confirmedBy: parseInt(session.user.id, 10),
        confirmedAt: new Date(),
      },
    });

    void logChange(getDeviceId(), "UPDATE", "deliverynotice", noticeId, {
      status: "confirmed",
      confirmedAt: updated.confirmedAt?.toISOString(),
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Error confirming delivery notice:", error);
    return Response.json({ error: "Error al confirmar el aviso" }, { status: 500 });
  }
}