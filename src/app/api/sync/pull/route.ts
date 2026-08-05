// POST /api/sync/pull - Send unsynced changes to a requesting peer
import { NextRequest, NextResponse } from "next/server";
import { getMyUnsyncedChanges, markSynced } from "@/lib/sync-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, since } = body;

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    const myDeviceId = process.env.DEVICE_ID || "unknown";
    const changes = await getMyUnsyncedChanges(myDeviceId);

    return NextResponse.json({
      success: true,
      deviceId: myDeviceId,
      changes,
      count: changes.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Sync pull failed" },
      { status: 500 }
    );
  }
}
