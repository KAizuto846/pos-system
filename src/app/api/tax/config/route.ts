import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaxRule, invalidateTaxRuleCache, computeTaxState } from "@/lib/tax-rule";
import { logAudit, getClientIp } from "@/lib/audit";

// GET /api/tax/config - configuracion del impuesto + historial (solo admin)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const rule = await getTaxRule();
    const state = computeTaxState(rule);

    let affectedCount = 0;
    if (rule && rule.active) {
      if (rule.scope === "SUPPLIER") {
        affectedCount = await prisma.product.count({ where: { supplierId: rule.scopeValue ?? -1 } });
      } else if (rule.scope === "DEPARTMENT") {
        affectedCount = await prisma.product.count({ where: { departmentId: rule.scopeValue ?? -1 } });
      } else if (rule.scope === "MIN_PRICE") {
        affectedCount = await prisma.product.count({ where: { price: { gte: rule.scopeValue ?? 0 } } });
      } else {
        affectedCount = await prisma.product.count();
      }
    }

    const history = await prisma.taxLog.findMany({ orderBy: { at: "desc" }, take: 50 });

    return NextResponse.json({
      rule,
      state,
      affectedCount,
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        userName: h.userName,
        note: h.note,
        at: h.at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}

// PUT /api/tax/config - guarda la configuracion (solo admin)
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json();
    const percentage = Number(body.percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 1000) {
      return NextResponse.json({ error: "El porcentaje debe estar entre 0 y 1000" }, { status: 400 });
    }

    const applyTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.applyTime || ""))
      ? String(body.applyTime)
      : "20:00";

    const scope = ["ALL", "SUPPLIER", "DEPARTMENT", "MIN_PRICE"].includes(String(body.scope))
      ? String(body.scope)
      : "ALL";

    let scopeValue: number | null = null;
    if (scope === "MIN_PRICE") {
      scopeValue = Math.max(0, Number(body.scopeValue) || 0);
    } else if (scope === "SUPPLIER" || scope === "DEPARTMENT") {
      scopeValue = Number(body.scopeValue) || null;
    }

    const existing = await getTaxRule();
    const data = {
      name: String(body.name || ""),
      percentage,
      applyTime,
      scope,
      scopeValue,
      active: Boolean(body.active),
      status: existing?.status ?? "schedule",
    };

    const saved = existing
      ? await prisma.taxRule.update({ where: { id: existing.id }, data })
      : await prisma.taxRule.create({ data });

    invalidateTaxRuleCache();

    await prisma.taxLog.create({
      data: {
        ruleId: saved.id,
        action: "config",
        userName: session.user.name || session.user.email || "Admin",
        note: `Config: +${percentage}% desde ${applyTime} (${scope}${scopeValue != null ? `:${scopeValue}` : ""})`,
      },
    });

    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "tax",
      entityId: saved.id,
      description: `Impuesto configurado: +${percentage}% desde ${applyTime}`,
      details: { percentage, applyTime, scope, scopeValue },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true, rule: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}