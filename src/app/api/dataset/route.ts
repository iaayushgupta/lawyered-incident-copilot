import { NextResponse } from "next/server";
import { datasetStats } from "@/lib/data/incidents";

// GET /api/dataset — synthetic dataset statistics (size, adversarial %, tags, difficulty).
export function GET() {
  return NextResponse.json(datasetStats());
}
