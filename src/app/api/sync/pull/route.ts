// POST /api/sync/pull - Send unsynced changes to a requesting peer
import { NextRequest, NextResponse } from "next/server";
import { getMyUnsyncedChanges } from "@/lib/sync-engine";
import { isSyncAuthorized, readLimitedJson, SyncRequestError } from "@/lib/sync-request";

interface PullBody {
  deviceId?: unknown;
  since?: unknown;
  limit?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSyncAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readLimitedJson(request, 16 * 1024) as PullBody;
    const { deviceId, since } = body;

    if (typeof deviceId !== "string" || !deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    const parsedSince = since === undefined ? undefined : Number(since);
    if (parsedSince !== undefined && (!Number.isSafeInteger(parsedSince) || parsedSince < 0)) {
      return NextResponse.json({ error: "since must be a non-negative integer" }, { status: 400 });
    }

    const requestedLimit = Number(body.limit ?? 500);
    const limit = Number.isSafeInteger(requestedLimit)
      ? Math.min(500, Math.max(1, requestedLimit))
      : 500;

    const myDeviceId = process.env.DEVICE_ID || "unknown";
    const changes = await getMyUnsyncedChanges(myDeviceId, parsedSince, limit);

    return NextResponse.json({
      success: true,
      deviceId: myDeviceId,
      changes,
      count: changes.length,
    });
  } catch (error) {
    const status = error instanceof SyncRequestError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync pull failed" },
      { status }
    );
  }
}
