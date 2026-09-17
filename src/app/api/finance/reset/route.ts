import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compare } from "bcrypt-ts";
import { logAudit, getClientIp } from "@/lib/audit";

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

    // Reiniciar TODO lo financiero a cero: ventas (cascada a items y
    // reembolsos) y registros de caja. Productos, lotes y stock no se tocan.
    const result = await prisma.$transaction(async (tx) => {
      const removedSales = await tx.sale.deleteMany({});
      const removedEntries = await tx.cashEntry.deleteMany({});
      return { sales: removedSales.count, entries: removedEntries.count };
    });

    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "finance",
      entityId: null,
      description: `Finanzas reiniciadas: ${result.sales} ventas y ${result.entries} registros de caja eliminados`,
      details: { sales: result.sales, entries: result.entries },
      ip: getClientIp(request),
    });

    return Response.json({
      success: true,
      message: `Finanzas reiniciadas: ${result.sales} ventas y ${result.entries} registros de caja eliminados`,
    });
  } catch (error) {
    console.error("Finance reset error:", error);
    return Response.json({ error: "Error al reiniciar finanzas" }, { status: 500 });
  }
}