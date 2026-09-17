import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setDeviceId } from "@/lib/sync-utils";

// GET /api/setup/config - configuracion de negocio/dispositivo persistida en DB
export async function GET() {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["businessName", "deviceName", "serverPort"] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({
      businessName: map.businessName || "",
      deviceName: map.deviceName || "",
      serverPort: map.serverPort || "3000",
      configured: Boolean(map.businessName),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// POST /api/setup/config - guarda negocio/dispositivo (usado por el setup web)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { businessName, deviceName, serverPort } = body || {};

    const entries: { key: string; value: string }[] = [];
    if (typeof businessName === "string" && businessName.trim()) {
      entries.push({ key: "businessName", value: businessName.trim() });
    }
    if (typeof deviceName === "string" && deviceName.trim()) {
      entries.push({ key: "deviceName", value: deviceName.trim() });
    }
    if (typeof serverPort === "string" && serverPort.trim()) {
      entries.push({ key: "serverPort", value: serverPort.trim() });
    }

    for (const entry of entries) {
      await prisma.appSetting.upsert({
        where: { key: entry.key },
        create: entry,
        update: { value: entry.value },
      });
    }

    // El deviceName del setup identifica este equipo en el sync
    if (typeof deviceName === "string" && deviceName.trim()) {
      setDeviceId(deviceName.trim());
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al guardar" }, { status: 500 });
  }
}
