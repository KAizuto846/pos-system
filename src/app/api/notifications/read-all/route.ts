import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });

    return Response.json({ success: true, marked: result.count });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return Response.json({ error: "Error al marcar notificaciones" }, { status: 500 });
  }
}
