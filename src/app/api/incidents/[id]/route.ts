import { NextResponse } from "next/server";
import { getSyntheticById } from "@/lib/data/incidents";
import { hydrateIncident } from "@/lib/data/hydrate";
import { evaluateCase } from "@/lib/evaluation/engine";

// GET /api/incidents/:id — full hydrated incident + its evaluation vs ground truth.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const synthetic = getSyntheticById(id);
  if (!synthetic) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { incident, events, audit } = hydrateIncident(synthetic);
  return NextResponse.json({
    incident,
    events,
    audit,
    groundTruth: synthetic.expected,
    evaluation: evaluateCase(synthetic),
  });
}
