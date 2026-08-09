import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compare } from "bcrypt-ts";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json();
    const { password } = body;

    if (typeof password !== "string" || !password) {
      return Response.json({ error: "Ingresa la contraseña de administrador" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(session.user.id, 10) },
      select: { password: true },
    });
    if (!user || !user.password || !(await compare(password, user.password))) {
      return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

    const deleted = await prisma.cashEntry.deleteMany({});

    return Response.json({
      success: true,
      deleted,
      message: `Se eliminaron ${deleted.count} registros de finanzas`,
    });
  } catch (error) {
    console.error("Finance reset error:", error);
    return Response.json({ error: "Error al reiniciar finanzas" }, { status: 500 });
  }
}