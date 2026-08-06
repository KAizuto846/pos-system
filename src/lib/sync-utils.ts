import os from "os";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

let cachedDeviceId: string | null = null;

// Identificador estable del dispositivo.
// Prioridad: DEVICE_ID (Electron/config) > AppSetting deviceName (setup web) > hostname.
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  if (process.env.DEVICE_ID) {
    cachedDeviceId = process.env.DEVICE_ID;
    return cachedDeviceId;
  }

  try {
    cachedDeviceId = os.hostname() || `device-${crypto.randomBytes(4).toString("hex")}`;
  } catch {
    cachedDeviceId = `device-${crypto.randomBytes(4).toString("hex")}`;
  }

  return cachedDeviceId;
}

// Igual que getDeviceId pero ademas consulta el deviceName persistido por el setup web.
export async function resolveServerDeviceId(): Promise<string> {
  if (process.env.DEVICE_ID) {
    cachedDeviceId = process.env.DEVICE_ID;
    return cachedDeviceId;
  }

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "deviceName" } });
    if (row?.value?.trim()) {
      cachedDeviceId = row.value.trim();
      return cachedDeviceId;
    }
  } catch {
    // Ignorar errores de DB, usar fallback
  }

  return getDeviceId();
}

// Sobrescribe el id en runtime (usado al completar el setup web con deviceName).
export function setDeviceId(id: string) {
  if (id && id.trim()) {
    cachedDeviceId = id.trim();
  }
}
