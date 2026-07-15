import { NextResponse } from "next/server";
import { LAWYERS } from "@/lib/data/master";

// GET /api/lawyers — mock lawyer directory (simulated success/quality scores).
export function GET() {
  return NextResponse.json({ count: LAWYERS.length, lawyers: LAWYERS });
}
