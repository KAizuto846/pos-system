import { NextRequest, NextResponse } from "next/server";
import { getRelayConfig, saveRelayConfig, testRelayConnection } from "@/lib/relay-sync";

// GET /api/sync/relay/config - estado de la configuracion del relay
export async function GET() {
  try {
    const { relayUrl, syncSecret } = await getRelayConfig();
    const test = relayUrl ? await testRelayConnection(relayUrl, syncSecret) : null;
    return NextResponse.json({
      relayUrl,
      hasSecret: Boolean(syncSecret),
      connected: test?.ok ?? false,
      lastTestError: test?.error ?? null,
      relayStoredChanges: test?.storedChanges ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// POST /api/sync/relay/config - guarda la configuracion (URL + secret compartido)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const relayUrl = typeof body?.relayUrl === "string" ? body.relayUrl : "";
    const syncSecret = typeof body?.syncSecret === "string" ? body.syncSecret : "";

    if (!relayUrl.trim()) {
      return NextResponse.json({ error: "La URL del relay es requerida" }, { status: 400 });
    }

    await saveRelayConfig(relayUrl, syncSecret);
    const test = await testRelayConnection(relayUrl, syncSecret);
    return NextResponse.json({ ...test, saved: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al guardar" }, { status: 500 });
  }
}
