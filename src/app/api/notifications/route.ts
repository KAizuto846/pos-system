import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkAndNotifyExpiry } from "@/lib/expiry-checker";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const notifications = await prisma.notification.findMany({
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      include: {
        product: { select: { id: true, name: true, barcode: true } },
      },
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return Response.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Error listing notifications:", error);
    return Response.json({ error: "Error al obtener notificaciones" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, message, productId, severity } = body;

    if (!type || !title || !message) {
      return Response.json({ error: "type, title y message son requeridos" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        productId: productId ? parseInt(productId) : null,
        severity: severity || "warning",
      },
    });

    return Response.json(notification, { status: 201 });
  } catch (error) {
    console.error("Error creating notification:", error);
    return Response.json({ error: "Error al crear notificación" }, { status: 500 });
  }
}
