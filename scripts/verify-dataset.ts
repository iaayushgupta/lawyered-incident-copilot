// Standalone dataset sanity check. Run: npx tsx scripts/verify-dataset.ts
import { SYNTHETIC_INCIDENTS, datasetStats } from "../src/lib/data/incidents";
import { evaluateAll } from "../src/lib/evaluation/metrics";
import { LEGAL_SOURCES } from "../src/lib/data/sources";

const stats = datasetStats();
console.log("── Dataset ──");
console.log("Total incidents:", stats.total);
console.log("Adversarial/negative:", stats.adversarial, `(${stats.adversarialPct}%)`);
console.log("By difficulty:", stats.byDifficulty);

const ids = new Set(SYNTHETIC_INCIDENTS.map((s) => s.id));
if (ids.size !== SYNTHETIC_INCIDENTS.length) throw new Error("Duplicate incident ids!");

// Distinct tags coverage
const tags = Object.keys(stats.tagCounts);
console.log("Distinct tags covered:", tags.length);

// Every non-abstaining case with recommended actions has ≥1 source (or is a modelled failure).
let ungrounded = 0;
for (const s of SYNTHETIC_INCIDENTS) {
  const sys = s.simulatedSystemOutput;
  if (!sys.shouldAbstain && sys.recommendedActions.length > 0 && sys.sourceIds.length === 0) ungrounded++;
}
console.log("Ungrounded (modelled unsupported-claim) cases:", ungrounded);

const { metrics } = evaluateAll();
console.log("\n── Evaluation (system output vs ground truth) ──");
console.log("Passed:", metrics.passed, "/", metrics.total);
console.log("Classification accuracy:", (metrics.classificationAccuracy * 100).toFixed(1) + "%");
console.log("Urgency accuracy:", (metrics.urgencyAccuracy * 100).toFixed(1) + "%");
console.log("Fraud P/R:", metrics.fraud.precision.toFixed(2), "/", metrics.fraud.recall.toFixed(2));
console.log("Contradiction P/R:", metrics.contradiction.precision.toFixed(2), "/", metrics.contradiction.recall.toFixed(2));
console.log("Escalation recall:", (metrics.escalationRecall * 100).toFixed(1) + "%");
console.log("Source grounding rate:", (metrics.sourceGroundingRate * 100).toFixed(1) + "%");
console.log("Calibration error (ECE):", metrics.calibrationError.toFixed(3));
console.log("Routing top-1 / top-3:", (metrics.routingTop1 * 100).toFixed(0) + "% / " + (metrics.routingTop3 * 100).toFixed(0) + "%");
console.log("Dangerous failures:", metrics.dangerousFailureCounts);

console.log("\nLegal sources:", LEGAL_SOURCES.length);
console.log("OK");
