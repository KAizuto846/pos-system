// POST /api/sync/push - Receive changes from a peer device
import { NextRequest, NextResponse } from "next/server";
import { applyChanges, type SyncLogEntry } from "@/lib/sync-engine";
import { isSyncAuthorized, readLimitedJson, SyncRequestError } from "@/lib/sync-request";

interface PushBody {
  changes?: unknown;
  deviceId?: unknown;
}

function isSyncChange(value: unknown): value is SyncLogEntry {
  if (!value || typeof value !== "object") return false;
  const change = value as Partial<SyncLogEntry>;
  return Number.isSafeInteger(change.id)
    && typeof change.deviceId === "string"
    && typeof change.operation === "string"
    && typeof change.entity === "string"
    && Number.isSafeInteger(change.entityId)
    && typeof change.data === "string"
    && (typeof change.timestamp === "string" || change.timestamp instanceof Date)
    && typeof change.synced === "boolean"
    && Number.isSafeInteger(change.syncVersion);
}

export async function POST(request: NextRequest) {
  try {
    if (!isSyncAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readLimitedJson(request, 1024 * 1024) as PushBody;
    const { changes, deviceId } = body;

    if (!changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    if (changes.length > 500) {
      return NextResponse.json({ error: "Maximum 500 changes per request" }, { status: 413 });
    }

    if (!changes.every(isSyncChange)) {
      return NextResponse.json({ error: "Invalid changes payload" }, { status: 400 });
    }

    if (typeof deviceId !== "string" || !deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    const myDeviceId = process.env.DEVICE_ID || "unknown";
    const result = await applyChanges(changes, myDeviceId);

    return NextResponse.json({
      success: true,
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors.length,
    });
  } catch (error) {
    const status = error instanceof SyncRequestError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync push failed" },
      { status }
    );
  }
}
