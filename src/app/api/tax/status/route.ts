import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTaxRule, computeTaxState } from "@/lib/tax-rule";

// GET /api/tax/status - estado actual del impuesto para el POS (cualquier usuario)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const rule = await getTaxRule();
    const state = computeTaxState(rule);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}