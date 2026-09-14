import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const notifId = parseInt(id, 10);
    if (isNaN(notifId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const notification = await prisma.notification.update({
      where: { id: notifId },
      data: { read: true },
    });

    return Response.json(notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return Response.json({ error: "Error al marcar notificación" }, { status: 500 });
  }
}
