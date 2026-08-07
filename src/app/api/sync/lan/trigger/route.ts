// POST /api/sync/lan/trigger - ejecuta una sincronizacion LAN manual
import { NextResponse } from "next/server";
import { runLanSync } from "@/lib/lan-sync";

export async function POST() {
  try {
    const result = await runLanSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync LAN fallo" },
      { status: 500 }
    );
  }
}
