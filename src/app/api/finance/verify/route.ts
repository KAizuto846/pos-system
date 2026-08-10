import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KEY = "financeLastVerified";

// GET /api/finance/verify - última verificación de cálculos registrada
export async function GET() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    if (!row) return Response.json({ verified: null });
    let parsed: { at: string; userName: string } | null = null;
    try {
      const data = JSON.parse(row.value);
      if (typeof data.at === "string" && typeof data.userName === "string") {
        parsed = { at: data.at, userName: data.userName };
      }
    } catch {
      parsed = null;
    }
    return Response.json({ verified: parsed });
  } catch (e) {
    console.error("Error GET /api/finance/verify:", e);
    return Response.json({ error: "Error al leer la verificación" }, { status: 500 });
  }
}

// POST /api/finance/verify - registra que un administrador revisó los cálculos
// paso a paso y los confirmó (el usuario marca cada paso como correcto en la UI).
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const steps = Number(body?.steps);
    if (!Number.isInteger(steps) || steps < 1) {
      return Response.json({ error: "Número de pasos inválido" }, { status: 400 });
    }

    const record = {
      at: new Date().toISOString(),
      userId: session.user.id,
      userName: session.user.name || session.user.id,
      steps,
    };

    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(record) },
      update: { value: JSON.stringify(record) },
    });

    return Response.json({ ok: true, at: record.at, userName: record.userName });
  } catch (e) {
    console.error("Error POST /api/finance/verify:", e);
    return Response.json({ error: "Error al guardar la verificación" }, { status: 500 });
  }
}