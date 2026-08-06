import os from "os";
import crypto from "crypto";

let cachedDeviceId: string | null = null;

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
