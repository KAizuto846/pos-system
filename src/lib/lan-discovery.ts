// LAN Discovery - descubrimiento de dispositivos en la red local (server-side).
// Funciona tanto en web como en escritorio: corre dentro del proceso Node.js
// del servidor Next.js (no en el navegador), igual que Electron lo hace en su
// proceso principal. Protocolo UDP identico al de electron/main.js.
// NOTA: la lista de peers se persiste en AppSetting porque en modo standalone
// los route handlers corren en un worker separado de instrumentation (cada
// proceso tiene su propia copia de la memoria del modulo).

import dgram from "dgram";
import { prisma } from "@/lib/prisma";
import { resolveServerDeviceId } from "@/lib/sync-utils";

const DISCOVERY_PORT = 9876;
const DISCOVERY_MULTICAST = "230.185.192.108";
const PEERS_SETTING_KEY = "lanDiscoveredPeers";

export interface DiscoveredServer {
  ip: string;
  port: number;
  name: string;
  deviceId: string;
  lastSeen: number;
}

let discoverySocket: dgram.Socket | null = null;
let announceTimer: NodeJS.Timeout | null = null;
let discoveryStarted = false;

const discoveredServers = new Map<string, DiscoveredServer>();

// Excluir direcciones locales/loopback (se ignoran como "peers" en el sync)
function isLocalAddress(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip === "255.255.255.255" ||
    ip === "localhost"
  );
}

export function isLocalLanAddress(ip: string): boolean {
  return isLocalAddress(ip);
}

function keyOf(ip: string, port: number): string {
  return `${ip}:${port}`;
}

export function getDiscoveredServers(): DiscoveredServer[] {
  const now = Date.now();
  const list: DiscoveredServer[] = [];
  for (const server of discoveredServers.values()) {
    // Descartar dispositivos que no se anunciaron en los ultimos 30s
    if (now - server.lastSeen > 30000) continue;
    list.push(server);
  }
  return list;
}

export function clearDiscoveredServers() {
  discoveredServers.clear();
  void persistDiscoveredServers();
}

// Persistir la lista en AppSetting para que cualquier proceso (worker de
// route handlers) pueda leer los peers detectados por instrumentation.
async function persistDiscoveredServers() {
  try {
    const peers = getDiscoveredServers().map((s) => ({
      ip: s.ip,
      port: s.port,
      name: s.name,
      deviceId: s.deviceId,
    }));
    await prisma.appSetting.upsert({
      where: { key: PEERS_SETTING_KEY },
      create: { key: PEERS_SETTING_KEY, value: JSON.stringify(peers) },
      update: { value: JSON.stringify(peers) },
    });
  } catch {}
}

// Lectura desde la DB: usable desde cualquier proceso.
export async function getPersistedPeers() {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: PEERS_SETTING_KEY },
    });
    if (!row?.value) return [];
    return JSON.parse(row.value) as Array<{
      ip: string;
      port: number;
      name: string;
      deviceId: string;
    }>;
  } catch {
    return [];
  }
}

function schedulePersist() {
  // Debounce corto: persistir cada vez que llega un announce (max ~1/s)
  void persistDiscoveredServers();
}

export function startLanDiscovery() {
  if (discoveryStarted) return;
  discoveryStarted = true;

  try {
    discoverySocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    discoverySocket.on("listening", () => {
      discoverySocket?.setBroadcast(true);
      discoverySocket?.setMulticastTTL(128);
      try {
        discoverySocket?.addMembership(DISCOVERY_MULTICAST);
      } catch {}
    });
    discoverySocket.on("message", (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === "pos-server-announce" && data.port) {
          if (isLocalAddress(rinfo.address)) return;
          const server: DiscoveredServer = {
            ip: rinfo.address,
            port: Number(data.port),
            name: data.name || "POS Server",
            deviceId: data.deviceId || "",
            lastSeen: Date.now(),
          };
          discoveredServers.set(keyOf(server.ip, server.port), server);
          schedulePersist();
        }
      } catch {}
    });
    discoverySocket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
      // ok
    });
  } catch (e) {
    console.error("[lan] Discovery socket error:", e instanceof Error ? e.message : e);
    discoveryStarted = false;
  }
}

export async function announceLanServer(port: number) {
  if (announceTimer) return;
  const deviceId = await resolveServerDeviceId().catch(() => "equipo");
  const sock = dgram.createSocket("udp4");
  const name = deviceId || "POS Server";
  const msg = JSON.stringify({
    type: "pos-server-announce",
    port,
    name,
    deviceId,
  });

  const send = () => {
    try {
      sock.send(msg, DISCOVERY_PORT, DISCOVERY_MULTICAST);
      sock.send(msg, DISCOVERY_PORT, "255.255.255.255");
    } catch {}
  };
  send();
  announceTimer = setInterval(send, 5000);
}

export function stopLanDiscovery() {
  if (announceTimer) {
    clearInterval(announceTimer);
    announceTimer = null;
  }
  if (discoverySocket) {
    try {
      discoverySocket.close();
    } catch {}
    discoverySocket = null;
  }
  discoveryStarted = false;
}
