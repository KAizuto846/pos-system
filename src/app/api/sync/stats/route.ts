import { NextResponse } from "next/server";
import { getSyncStats } from "@/lib/sync-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getSyncStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
