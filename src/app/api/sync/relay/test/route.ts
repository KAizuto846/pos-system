import { NextRequest, NextResponse } from "next/server";
import { testRelayConnection } from "@/lib/relay-sync";

// POST /api/sync/relay/test - probar conexion con el relay (sin guardar)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const relayUrl = typeof body?.relayUrl === "string" ? body.relayUrl : "";
    const syncSecret = typeof body?.syncSecret === "string" ? body.syncSecret : "";

    if (!relayUrl.trim()) {
      return NextResponse.json({ ok: false, error: "La URL del relay es requerida" }, { status: 400 });
    }

    const result = await testRelayConnection(relayUrl, syncSecret);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error de conexion" },
      { status: 500 }
    );
  }
}
