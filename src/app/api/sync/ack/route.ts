// POST /api/sync/ack - Mark local changes as acknowledged by a peer
import { NextRequest, NextResponse } from "next/server";
import { markSynced } from "@/lib/sync-engine";
import { isSyncAuthorized, readLimitedJson, SyncRequestError } from "@/lib/sync-request";

interface AckBody {
  ids?: unknown;
  deviceId?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSyncAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readLimitedJson(request, 256 * 1024) as AckBody;

    if (typeof body.deviceId !== "string" || !body.deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    if (!Array.isArray(body.ids) || body.ids.length > 5000) {
      return NextResponse.json({ error: "ids must be an array (max 5000)" }, { status: 400 });
    }

    const ids = body.ids.filter((id): id is number => Number.isSafeInteger(id));
    if (ids.length === 0) {
      return NextResponse.json({ success: true, marked: 0 });
    }

    await markSynced(ids);

    return NextResponse.json({ success: true, marked: ids.length });
  } catch (error) {
    const status = error instanceof SyncRequestError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync ack failed" },
      { status }
    );
  }
}
