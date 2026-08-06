import { NextResponse } from "next/server";
import { runRelaySync } from "@/lib/relay-sync";

// POST /api/sync/relay/trigger - sincronizacion manual con el relay
export async function POST() {
  try {
    const result = await runRelaySync();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error de sync" },
      { status: 500 }
    );
  }
}
