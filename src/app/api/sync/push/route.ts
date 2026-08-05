// POST /api/sync/push - Receive changes from a peer device
import { NextRequest, NextResponse } from "next/server";
import { applyChanges } from "@/lib/sync-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changes, deviceId } = body;

    if (!changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    if (!deviceId) {
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Sync push failed" },
      { status: 500 }
    );
  }
}
