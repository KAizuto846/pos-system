// GET /api/sync/lan/peers - lista los dispositivos detectados en la red local
import { NextResponse } from "next/server";
import { getDiscoveredServers, getPersistedPeers } from "@/lib/lan-discovery";
import { resolveServerDeviceId } from "@/lib/sync-utils";

export async function GET() {
  // En modo standalone los route handlers viven en un worker separado del
  // proceso que corre el discovery UDP, asi que se lee la lista persistida
  // en la DB como fuente primaria.
  const persisted = await getPersistedPeers();
  const peers = persisted.length > 0 ? persisted : getDiscoveredServers();
  const deviceId = await resolveServerDeviceId().catch(() => "");
  return NextResponse.json({ peers, deviceId });
}
