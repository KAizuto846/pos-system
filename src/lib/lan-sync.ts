// LAN Sync - sincronizacion P2P con dispositivos de la red local (server-side).
// Mismo protocolo que el sync de electron/main.js: por cada peer descubierto
// hace pull (cambios del peer -> servidor local) y push (cambios locales -> peer).
// Corre dentro del proceso Next.js, asi funciona en web y en escritorio.

import { getDiscoveredServers, getPersistedPeers, isLocalLanAddress, type DiscoveredServer } from "@/lib/lan-discovery";
import { getLocalBaseUrl, resolveServerDeviceId } from "@/lib/sync-utils";
import { prisma } from "@/lib/prisma";

const MAX_CHANGES = 500;
const SYNC_INTERVAL_MS = 5000;

// Cursors por peer (persistidos en AppSetting para sobrevivir reinicios)
function cursorKey(peerUrl: string, dir: "pullSince" | "pushSince"): string {
  return `lan${dir[0].toUpperCase()}${dir.slice(1)}:${peerUrl}`;
}

async function getCursor(key: string): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return Number(row?.value) || 0;
  } catch {
    return 0;
  }
}

async function setCursor(key: string, value: number) {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  } catch (e) {
    console.error("[lan] Cursor persist error:", e instanceof Error ? e.message : e);
  }
}

export interface LanPeerResult {
  peer: string;
  name: string;
  ok: boolean;
  pulled: number;
  pushed: number;
  error: string | null;
}

export interface LanSyncResult {
  at: string;
  peers: number;
  results: LanPeerResult[];
}

let syncInProgress = false;

// Excluir peers que son este mismo equipo
function isSelf(server: DiscoveredServer, myDeviceId: string): boolean {
  if (isLocalLanAddress(server.ip)) return true;
  if (server.deviceId && server.deviceId === myDeviceId) return true;
  return false;
}

async function syncWithPeer(peerUrl: string, myDeviceId: string): Promise<LanPeerResult> {
  let pulled = 0;
  let pushed = 0;
  try {
    // 1) Pull: traer cambios del peer y aplicarlos en el servidor local
    const pullSince = await getCursor(cursorKey(peerUrl, "pullSince"));
    const pullRes = await fetch(`http://${peerUrl}/api/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: myDeviceId, since: pullSince }),
    });
    if (pullRes.ok) {
      const pullData = await pullRes.json();
      if (pullData.changes && pullData.changes.length > 0) {
        const pushRes = await fetch(`${getLocalBaseUrl()}/api/sync/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: pullData.deviceId, changes: pullData.changes }),
        });
        if (pushRes.ok) {
          pulled = pullData.changes.length;
          const maxVersion = Math.max(...pullData.changes.map((c: { syncVersion: number }) => Number(c.syncVersion) || 0));
          await setCursor(cursorKey(peerUrl, "pullSince"), maxVersion);
        }
      }
    }

    // 2) Push: subir cambios locales al peer
    const pushSince = await getCursor(cursorKey(peerUrl, "pushSince"));
    const myRes = await fetch(`${getLocalBaseUrl()}/api/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: myDeviceId, since: pushSince }),
    });
    if (myRes.ok) {
      const myData = await myRes.json();
      if (myData.changes && myData.changes.length > 0) {
        const changes = myData.changes.slice(0, MAX_CHANGES);
        const peerPushRes = await fetch(`http://${peerUrl}/api/sync/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: myDeviceId, changes }),
        });
        if (peerPushRes.ok) {
          pushed = changes.length;
          // Ack local para no reenviar
          const ids = changes.map((c: { id: number }) => c.id);
          await fetch(`${getLocalBaseUrl()}/api/sync/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: myDeviceId, ids }),
          }).catch(() => {});
          const maxVersion = Math.max(...changes.map((c: { syncVersion: number }) => Number(c.syncVersion) || 0));
          await setCursor(cursorKey(peerUrl, "pushSince"), maxVersion);
        }
      }
    }
    return { peer: peerUrl, name: "", ok: true, pulled, pushed, error: null };
  } catch (e) {
    return { peer: peerUrl, name: "", ok: false, pulled, pushed, error: e instanceof Error ? e.message : "Peer offline" };
  }
}

export async function runLanSync(): Promise<LanSyncResult> {
  if (syncInProgress) {
    return { at: new Date().toISOString(), peers: 0, results: [] };
  }
  syncInProgress = true;
  try {
    const myDeviceId = await resolveServerDeviceId();
    // En modo standalone el trigger puede correr en un worker separado del
    // proceso que escucha UDP, asi que si la memoria esta vacia se usan los
    // peers persistidos en la DB.
    let peers = getDiscoveredServers().filter((s) => !isSelf(s, myDeviceId));
    if (peers.length === 0) {
      const persisted = await getPersistedPeers();
      peers = persisted.filter((s) => !isSelf(s as DiscoveredServer, myDeviceId)) as DiscoveredServer[];
    }
    const results: LanPeerResult[] = [];
    for (const server of peers) {
      const peerUrl = `${server.ip}:${server.port}`;
      const res = await syncWithPeer(peerUrl, myDeviceId);
      res.name = server.name || "";
      results.push(res);
    }
    if (results.length > 0) {
      console.log(`[lan] Sync: ${results.length} peer(s), +${results.reduce((a, r) => a + r.pulled, 0)} recibidos, +${results.reduce((a, r) => a + r.pushed, 0)} enviados`);
    }
    return { at: new Date().toISOString(), peers: results.length, results };
  } finally {
    syncInProgress = false;
  }
}

let loopStarted = false;

export function startLanSyncLoop() {
  if (loopStarted) return;
  loopStarted = true;
  setInterval(() => {
    runLanSync().catch((e) => {
      console.error("[lan] Loop error:", e instanceof Error ? e.message : e);
    });
  }, SYNC_INTERVAL_MS);
}
