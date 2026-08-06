// Relay Sync - Sincronizacion por internet a traves de un relay central
//
// Cuando los dispositivos NO estan en la misma red, cada uno hace pull/push
// contra un relay (servidor en la nube) que funciona como buzon de cambios.
// Reutiliza el engine local (sync-engine) y los cursors, persistidos en DB.

import { prisma } from "@/lib/prisma";
import type { SyncLogEntry } from "@/lib/sync-engine";
import { resolveServerDeviceId } from "@/lib/sync-utils";

const KEY_RELAY_URL = "relayUrl";
const KEY_RELAY_SECRET = "relaySecret";
const KEY_RELAY_PULL_SINCE = "relayPullSince";
const KEY_RELAY_PUSH_SINCE = "relayPushSince";

const MAX_CHANGES = 500;

export interface RelayConfig {
  relayUrl: string;
  syncSecret: string;
}

export interface RelaySyncResult {
  ok: boolean;
  pulled: number;
  pushed: number;
  error: string | null;
  at: string;
}

let relaySyncInProgress = false;

function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

// DeviceId estable: prioriza el deviceName configurado en el setup web (AppSetting)
// o DEVICE_ID (Electron). Refresca el cache en cada ejecucion.

async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

// ─── Config ──────────────────────────────────────────────────
export async function getRelayConfig(): Promise<RelayConfig> {
  const [relayUrl, syncSecret] = await Promise.all([
    getSetting(KEY_RELAY_URL),
    getSetting(KEY_RELAY_SECRET),
  ]);
  return { relayUrl: normalizeUrl(relayUrl), syncSecret };
}

export async function saveRelayConfig(url: string, secret: string) {
  await Promise.all([
    setSetting(KEY_RELAY_URL, normalizeUrl(url)),
    setSetting(KEY_RELAY_SECRET, secret.trim()),
  ]);
}

// ─── Conexion ────────────────────────────────────────────────
export async function testRelayConnection(
  url: string,
  secret: string
): Promise<{ ok: boolean; error: string | null; time?: string; storedChanges?: number }> {
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: "Ingresa la URL del relay" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${base}/health`, {
      headers: secret ? { "x-sync-secret": secret } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `El relay respondio ${res.status} (${res.statusText})` };
    }
    const data = await res.json();
    return {
      ok: true,
      error: null,
      time: data?.time,
      storedChanges: data?.storedChanges,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Tiempo de espera agotado" : e.message) : "Error de conexion";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Sync ────────────────────────────────────────────────────
// URL del servidor local. En Electron se setea PORT; en dev/web se lee del .env.
function getLocalBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, "");
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function localPush(changes: SyncLogEntry[], secret: string) {
  const localUrl = `${getLocalBaseUrl()}/api/sync/push`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-sync-secret"] = secret;
  const res = await fetch(localUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ deviceId: "relay", changes }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`Push local fallo (${res.status}): ${data?.error || res.statusText}`);
  }
  return res.json();
}

async function localPull(deviceId: string, since: number, secret: string) {
  const localUrl = `${getLocalBaseUrl()}/api/sync/pull`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-sync-secret"] = secret;
  const res = await fetch(localUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ deviceId, since }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`Pull local fallo (${res.status}): ${data?.error || res.statusText}`);
  }
  const data = await res.json();
  return data?.changes ?? [];
}

async function relayPull(url: string, secret: string, deviceId: string, since: number) {
  const res = await fetch(`${url}/api/sync/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": secret,
    },
    body: JSON.stringify({ deviceId, since }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`El relay respondio ${res.status}: ${data?.error || res.statusText}`);
  }
  const data = await res.json();
  return data?.changes ?? [];
}

async function relayPush(url: string, secret: string, deviceId: string, changes: SyncLogEntry[]) {
  const res = await fetch(`${url}/api/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": secret,
    },
    body: JSON.stringify({ deviceId, changes }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`El relay respondio ${res.status}: ${data?.error || res.statusText}`);
  }
  const data = await res.json();
  return data?.inserted ?? 0;
}

export async function runRelaySync(): Promise<RelaySyncResult> {
  if (relaySyncInProgress) {
    return { ok: false, pulled: 0, pushed: 0, error: "Sync en progreso", at: new Date().toISOString() };
  }
  relaySyncInProgress = true;
  try {
    const { relayUrl, syncSecret } = await getRelayConfig();
    if (!relayUrl) {
      return { ok: false, pulled: 0, pushed: 0, error: "Relay no configurado", at: new Date().toISOString() };
    }

    const deviceId = await resolveServerDeviceId();
    const localSecret = process.env.SYNC_SECRET || "";
    let pulled = 0;
    let pushed = 0;

    // 1) Pull: traer cambios de otros dispositivos desde el relay
    const pullSince = Number(await getSetting(KEY_RELAY_PULL_SINCE)) || 0;
    try {
      const changes = await relayPull(relayUrl, syncSecret, deviceId, pullSince);
      if (changes.length > 0) {
        // El engine local espera el campo `synced`; el relay no lo guarda.
        const normalized = changes.map((c: Record<string, unknown>) => ({
          ...c,
          synced: false,
          timestamp: c.timestamp ? new Date(String(c.timestamp)).toISOString() : new Date().toISOString(),
        }));
        await localPush(normalized as SyncLogEntry[], localSecret);
        pulled = changes.length;
        const maxVersion = Math.max(...changes.map((c: { syncVersion: number }) => Number(c.syncVersion) || 0));
        await setSetting(KEY_RELAY_PULL_SINCE, String(maxVersion));
      }
    } catch (e) {
      throw new Error(`Pull del relay: ${e instanceof Error ? e.message : e}`);
    }

    // 2) Push: subir mis cambios al relay
    const pushSince = Number(await getSetting(KEY_RELAY_PUSH_SINCE)) || 0;
    try {
      const myChanges = await localPull(deviceId, pushSince, localSecret);
      if (myChanges.length > 0) {
        const inserted = await relayPush(relayUrl, syncSecret, deviceId, myChanges.slice(0, MAX_CHANGES));
        pushed = inserted;
        const maxVersion = Math.max(...myChanges.map((c: { syncVersion: number }) => Number(c.syncVersion) || 0));
        await setSetting(KEY_RELAY_PUSH_SINCE, String(maxVersion));
      }
    } catch (e) {
      throw new Error(`Push al relay: ${e instanceof Error ? e.message : e}`);
    }

    return { ok: true, pulled, pushed, error: null, at: new Date().toISOString() };
  } catch (e) {
    return { ok: false, pulled: 0, pushed: 0, error: e instanceof Error ? e.message : "Error de sync", at: new Date().toISOString() };
  } finally {
    relaySyncInProgress = false;
  }
}
