import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// GET /api/audit?page=1&limit=50&action=login&entity=product&userId=3&q=texto
// Registro de auditoría: SOLO administradores.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = positiveInt(searchParams.get("page"), 1);
    const limit = Math.min(positiveInt(searchParams.get("limit"), 50), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    const action = searchParams.get("action");
    if (action) where.action = action;

    const entity = searchParams.get("entity");
    if (entity) where.entity = entity;

    const userId = positiveInt(searchParams.get("userId"), 0);
    if (userId > 0) where.userId = userId;

    const q = searchParams.get("q")?.trim();
    if (q) {
      where.OR = [
        { userName: { contains: q } },
        { description: { contains: q } },
        { entity: { contains: q } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return Response.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + logs.length < total,
      },
    });
  } catch (error) {
    console.error("Error listing audit logs:", error);
    return Response.json({ error: "Error al obtener el registro de auditoría" }, { status: 500 });
  }
}
