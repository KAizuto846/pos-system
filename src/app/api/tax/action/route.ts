import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaxRule, invalidateTaxRuleCache } from "@/lib/tax-rule";

// POST /api/tax/action - acciones manuales (solo admin)
// body: { action: "apply" | "revert" | "schedule" }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const { action } = await request.json();
    const rule = await getTaxRule();
    if (!rule) {
      return NextResponse.json({ error: "Primero configura el impuesto" }, { status: 400 });
    }
    if (!["apply", "revert", "schedule"].includes(action)) {
      return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
    }

    const nextStatus =
      action === "apply" ? "forced_on" : action === "revert" ? "forced_off" : "schedule";

    const saved = await prisma.taxRule.update({
      where: { id: rule.id },
      data: { status: nextStatus },
    });

    invalidateTaxRuleCache();

    const userName = session.user.name || session.user.email || "Admin";
    const note =
      action === "apply"
        ? "Impuesto activado manualmente"
        : action === "revert"
          ? "Impuesto revertido manualmente"
          : "Volver a horario automatico";

    await prisma.taxLog.create({
      data: { ruleId: rule.id, action, userName, note },
    });

    return NextResponse.json({ ok: true, status: saved.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}