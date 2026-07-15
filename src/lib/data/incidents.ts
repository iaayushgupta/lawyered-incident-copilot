// ─────────────────────────────────────────────────────────────────────────────
// Dataset assembly.
//
// Combines hand-authored signature scenarios with programmatically generated
// routine/variant cases, assigns deterministic timestamps + SLA windows, and
// exposes the full synthetic corpus plus a lookup.
// ─────────────────────────────────────────────────────────────────────────────

import type { SyntheticIncident } from "../synthetic/schema";
import type { Urgency } from "../types";
import { NOW, mulberry32, seedFrom } from "../utils";
import { SIGNATURES_A } from "./signatures-a";
import { SIGNATURES_B } from "./signatures-b";
import { SIGNATURES_C } from "./signatures-c";
import { generateIncidents } from "./generated";

// SLA target minutes by urgency (time to first lawyer review).
const SLA_MINUTES: Record<Urgency, number> = {
  critical: 15,
  high: 60,
  medium: 240,
  low: 1440,
};

function assignTimestamps(list: SyntheticIncident[]): SyntheticIncident[] {
  const rng = mulberry32(seedFrom("timestamps-v1"));
  return list.map((inc) => {
    // Spread creation times over the last ~5 days before NOW.
    const minutesAgo = Math.floor(rng() * 60 * 24 * 5) + 3;
    const createdAt = new Date(NOW.getTime() - minutesAgo * 60000).toISOString();
    return { ...inc, createdAt };
  });
}

const RAW: SyntheticIncident[] = [
  ...SIGNATURES_A,
  ...SIGNATURES_B,
  ...SIGNATURES_C,
  ...generateIncidents(58),
];

export const SYNTHETIC_INCIDENTS: SyntheticIncident[] = assignTimestamps(RAW);

const BY_ID = new Map(SYNTHETIC_INCIDENTS.map((s) => [s.id, s]));

export function getSyntheticById(id: string): SyntheticIncident | undefined {
  return BY_ID.get(id);
}

export function slaMinutesFor(urgency: Urgency): number {
  return SLA_MINUTES[urgency];
}

// Dataset stats — used by the dataset-verification script and docs.
export function datasetStats() {
  const total = SYNTHETIC_INCIDENTS.length;
  const adversarial = SYNTHETIC_INCIDENTS.filter(
    (s) =>
      s.evaluation.difficulty === "adversarial" ||
      s.evaluation.difficulty === "hard" ||
      s.expected.suspectedFraud ||
      s.expected.shouldAbstain ||
      s.expected.contradictions.length > 0 ||
      s.evaluation.expectedFailureModes.length > 0,
  ).length;
  const tagCounts: Record<string, number> = {};
  for (const s of SYNTHETIC_INCIDENTS) {
    for (const t of s.evaluation.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }
  return {
    total,
    adversarial,
    adversarialPct: Math.round((adversarial / total) * 100),
    tagCounts,
    byDifficulty: {
      easy: SYNTHETIC_INCIDENTS.filter((s) => s.evaluation.difficulty === "easy").length,
      medium: SYNTHETIC_INCIDENTS.filter((s) => s.evaluation.difficulty === "medium").length,
      hard: SYNTHETIC_INCIDENTS.filter((s) => s.evaluation.difficulty === "hard").length,
      adversarial: SYNTHETIC_INCIDENTS.filter((s) => s.evaluation.difficulty === "adversarial").length,
    },
  };
}
