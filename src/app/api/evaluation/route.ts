import { NextResponse } from "next/server";
import { evaluateAll } from "@/lib/evaluation/metrics";

// GET /api/evaluation — aggregate evaluation metrics computed from ground truth.
// Optional ?failures=1 to include the list of failing cases.
export function GET(req: Request) {
  const url = new URL(req.url);
  const includeFailures = url.searchParams.get("failures") === "1";
  const { cases, metrics } = evaluateAll();
  return NextResponse.json({
    metrics,
    ...(includeFailures
      ? {
          failures: cases
            .filter((c) => !c.passed)
            .map((c) => ({
              id: c.syntheticId,
              title: c.title,
              failureType: c.failureType,
              dangerousFailures: c.dangerousFailures,
              affectedComponent: c.affectedComponent,
              recommendedImprovement: c.recommendedImprovement,
            })),
        }
      : {}),
  });
}
