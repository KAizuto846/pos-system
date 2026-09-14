import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PALETTES, APP_FONTS } from "@/lib/themes";
import { logAudit, getClientIp } from "@/lib/audit";

const KEYS = ["businessName", "businessPalette", "businessFont", "businessLogo"] as const;

// GET /api/settings - configuracion del negocio (nombre, paleta, fuente, logo)
export async function GET() {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...KEYS] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Response.json({
      businessName: map.businessName || "",
      palette: PALETTES.some((p) => p.id === map.businessPalette) ? map.businessPalette : "emerald",
      font: APP_FONTS.some((f) => f.id === map.businessFont) ? map.businessFont : "sistema",
      logo: map.businessLogo || "",
    });
  } catch (e) {
    console.error("Error GET /api/settings:", e);
    return Response.json({ error: "Error al leer la configuración" }, { status: 500 });
  }
}

// PUT /api/settings - guarda configuracion del negocio (solo administradores)
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
    }

    const entries: { key: string; value: string }[] = [];

    if (typeof body.businessName === "string") {
      const name = body.businessName.trim();
      if (name.length > 100) {
        return Response.json({ error: "El nombre no puede superar 100 caracteres" }, { status: 400 });
      }
      entries.push({ key: "businessName", value: name });
    }

    if (typeof body.palette === "string") {
      if (!PALETTES.some((p) => p.id === body.palette)) {
        return Response.json({ error: "Paleta inválida" }, { status: 400 });
      }
      entries.push({ key: "businessPalette", value: body.palette });
    }

    if (typeof body.font === "string") {
      if (!APP_FONTS.some((f) => f.id === body.font)) {
        return Response.json({ error: "Fuente inválida" }, { status: 400 });
      }
      entries.push({ key: "businessFont", value: body.font });
    }

    if (typeof body.logo === "string") {
      if (body.logo !== "" && !body.logo.startsWith("data:image/")) {
        return Response.json({ error: "El logo debe ser una imagen" }, { status: 400 });
      }
      if (body.logo.length > 1_500_000) {
        return Response.json({ error: "El logo es demasiado grande (máx. ~1 MB)" }, { status: 400 });
      }
      entries.push({ key: "businessLogo", value: body.logo });
    }

    if (entries.length === 0) {
      return Response.json({ error: "No hay campos para guardar" }, { status: 400 });
    }

    for (const entry of entries) {
      await prisma.appSetting.upsert({
        where: { key: entry.key },
        create: entry,
        update: { value: entry.value },
      });
    }

    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...KEYS] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "settings",
      entityId: null,
      description: "Configuración del negocio modificada",
      details: { businessName: body.businessName, palette: body.palette, font: body.font, logoChanged: typeof body.logo === "string" },
      ip: getClientIp(request),
    });

    return Response.json({
      ok: true,
      business: {
        businessName: map.businessName || "",
        palette: PALETTES.some((p) => p.id === map.businessPalette) ? map.businessPalette : "emerald",
        font: APP_FONTS.some((f) => f.id === map.businessFont) ? map.businessFont : "sistema",
        logo: map.businessLogo || "",
      },
    });
  } catch (e) {
    console.error("Error PUT /api/settings:", e);
    return Response.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}