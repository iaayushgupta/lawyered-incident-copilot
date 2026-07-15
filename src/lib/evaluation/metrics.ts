// ─────────────────────────────────────────────────────────────────────────────
// Aggregate evaluation metrics + slices + calibration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SyntheticIncident } from "../synthetic/schema";
import { SYNTHETIC_INCIDENTS } from "../data/incidents";
import { type CaseEvaluation, evaluateCase, evaluateRouting, type DangerousFailureType } from "./engine";

export interface PrecisionRecall {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

function pr(pred: boolean[], truth: boolean[]): PrecisionRecall {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < pred.length; i++) {
    if (pred[i] && truth[i]) tp++;
    else if (pred[i] && !truth[i]) fp++;
    else if (!pred[i] && truth[i]) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, tn, precision, recall, f1 };
}

function acc(flags: boolean[]): number {
  if (!flags.length) return 1;
  return flags.filter(Boolean).length / flags.length;
}

export interface CalibrationBucket {
  bucket: string;
  count: number;
  avgConfidence: number;
  accuracy: number;
  gap: number;
}

export interface AggregateMetrics {
  total: number;
  passed: number;
  classificationAccuracy: number;
  urgencyAccuracy: number;
  fraud: PrecisionRecall;
  contradiction: PrecisionRecall;
  missingInfoDetection: number;
  abstentionCorrectness: number;
  escalationRecall: number;
  sourceGroundingRate: number;
  unsupportedClaimRate: number;
  fabricatedSourceRate: number;
  fieldExtractionReliability: number;
  routingTop1: number;
  routingTop3: number;
  averageConfidence: number;
  calibrationError: number; // ECE
  recommendationAcceptanceRate: number; // simulated from resolutions in dataset heuristic
  lawyerCorrectionRate: number;
  falsePositiveRate: number; // across binary detectors (contradiction+fraud)
  falseNegativeRate: number;
  calibration: CalibrationBucket[];
  dangerousFailureCounts: Record<DangerousFailureType, number>;
  timeSavedMinutes: number;
  avgTimeToEscalationMin: number;
}

export function evaluateAll(incidents: SyntheticIncident[] = SYNTHETIC_INCIDENTS): {
  cases: CaseEvaluation[];
  metrics: AggregateMetrics;
} {
  const cases = incidents.map(evaluateCase);

  const classificationAccuracy = acc(cases.map((c) => c.classificationCorrect));
  const urgencyAccuracy = acc(cases.map((c) => c.urgencyCorrect));

  const fraud = pr(cases.map((c) => c.fraudPredicted), cases.map((c) => c.fraudExpected));
  const contradiction = pr(cases.map((c) => c.contradictionPredicted), cases.map((c) => c.contradictionExpected));

  const missingCases = cases.filter((c) => c.missingInfoExpected);
  const missingInfoDetection = acc(missingCases.map((c) => c.missingInfoDetected));

  const abstentionCorrectness = acc(cases.map((c) => c.abstentionExpected === c.abstentionPredicted));

  const escalationCases = cases.filter((c) => c.escalationExpected);
  const escalationRecall = acc(escalationCases.map((c) => c.escalationPredicted));

  const nonAbstain = cases.filter((c) => !c.abstentionPredicted);
  const sourceGroundingRate = acc(nonAbstain.map((c) => c.sourceGrounded));
  const unsupportedClaimRate = acc(cases.map((c) => c.unsupportedClaim ? true : false)) ; // fraction true
  const fabricatedSourceRate = cases.filter((c) => c.fabricatedSource).length / cases.length;

  // field extraction reliability = docs without quality/integrity-degrading findings
  let totalDocs = 0, cleanDocs = 0;
  for (const s of incidents) {
    for (const d of s.documents) {
      totalDocs++;
      const degraded = d.findings.some((f) =>
        ["low_quality_image", "vehicle_number_mismatch", "altered_content", "cropped_content", "incorrect_ocr" as never].includes(f),
      );
      if (!degraded) cleanDocs++;
    }
  }
  const fieldExtractionReliability = totalDocs ? cleanDocs / totalDocs : 1;

  const routing = incidents.map((s) => evaluateRouting(s));
  const routingTop1 = acc(routing.map((r) => r.top1));
  const routingTop3 = acc(routing.map((r) => r.top3));

  const averageConfidence = cases.reduce((sum, c) => sum + c.confidence, 0) / cases.length;

  // Calibration (ECE) over confidence buckets.
  const buckets = ["very_low", "low", "medium", "high", "very_high"];
  const calibration: CalibrationBucket[] = buckets.map((b) => {
    const inBucket = cases.filter((c) => c.confidenceBucket === b);
    const avgConfidence = inBucket.length ? inBucket.reduce((s, c) => s + c.confidence, 0) / inBucket.length : 0;
    const accuracy = inBucket.length ? inBucket.filter((c) => c.correctOverall).length / inBucket.length : 0;
    return { bucket: b, count: inBucket.length, avgConfidence, accuracy, gap: Math.abs(avgConfidence - accuracy) };
  });
  const calibrationError = calibration.reduce((sum, b) => sum + (b.count / cases.length) * b.gap, 0);

  // False positive / negative rates across binary detectors (contradiction + fraud).
  const fp = contradiction.fp + fraud.fp;
  const fn = contradiction.fn + fraud.fn;
  const negatives = contradiction.fp + contradiction.tn + fraud.fp + fraud.tn;
  const positives = contradiction.tp + contradiction.fn + fraud.tp + fraud.fn;
  const falsePositiveRate = negatives ? fp / negatives : 0;
  const falseNegativeRate = positives ? fn / positives : 0;

  // Simulated acceptance / correction rate: passing non-adversarial cases are
  // "accepted"; failing cases receive a lawyer correction.
  const recommendationAcceptanceRate = acc(cases.map((c) => c.passed));
  const lawyerCorrectionRate = 1 - recommendationAcceptanceRate;

  const dangerousFailureCounts = {
    failed_critical_escalation: 0,
    unsupported_legal_recommendation: 0,
    fabricated_source: 0,
    incorrect_verified_status: 0,
    missed_suspected_fraud: 0,
    audit_log_gap: 0,
  } as Record<DangerousFailureType, number>;
  for (const c of cases) for (const d of c.dangerousFailures) dangerousFailureCounts[d]++;

  // Time-saved heuristic: each auto-triaged case saves ~22 min of manual coordination.
  const timeSavedMinutes = cases.filter((c) => !c.abstentionPredicted).length * 22;
  const avgTimeToEscalationMin =
    escalationCases.length ? 4 : 0; // simulated median first-escalation latency

  const metrics: AggregateMetrics = {
    total: cases.length,
    passed: cases.filter((c) => c.passed).length,
    classificationAccuracy,
    urgencyAccuracy,
    fraud,
    contradiction,
    missingInfoDetection,
    abstentionCorrectness,
    escalationRecall,
    sourceGroundingRate,
    unsupportedClaimRate,
    fabricatedSourceRate,
    fieldExtractionReliability,
    routingTop1,
    routingTop3,
    averageConfidence,
    calibrationError,
    recommendationAcceptanceRate,
    lawyerCorrectionRate,
    falsePositiveRate,
    falseNegativeRate,
    calibration,
    dangerousFailureCounts,
    timeSavedMinutes,
    avgTimeToEscalationMin,
  };

  return { cases, metrics };
}

// ── Slices ──
export type SliceKey =
  | "language"
  | "incidentCategory"
  | "jurisdiction"
  | "documentQuality"
  | "channel"
  | "fraudStatus"
  | "ambiguityLevel"
  | "vehicleType"
  | "confidenceBucket";

export interface SliceRow {
  key: string;
  count: number;
  passRate: number;
  classificationAccuracy: number;
}

export function sliceBy(cases: CaseEvaluation[], key: SliceKey, incidents = SYNTHETIC_INCIDENTS): SliceRow[] {
  const byId = new Map(incidents.map((s) => [s.id, s]));
  const groups = new Map<string, CaseEvaluation[]>();
  for (const c of cases) {
    let k: string;
    switch (key) {
      case "language": k = c.language; break;
      case "incidentCategory": k = byId.get(c.syntheticId)?.expected.incidentType ?? "unknown"; break;
      case "jurisdiction": k = c.jurisdiction; break;
      case "documentQuality": k = c.documentQuality; break;
      case "channel": k = c.channel; break;
      case "fraudStatus": k = c.fraudStatus ? "fraud" : "non-fraud"; break;
      case "ambiguityLevel": k = c.ambiguityLevel; break;
      case "vehicleType": k = c.vehicleType; break;
      case "confidenceBucket": k = c.confidenceBucket; break;
    }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  return Array.from(groups.entries())
    .map(([k, list]) => ({
      key: k,
      count: list.length,
      passRate: list.filter((c) => c.passed).length / list.length,
      classificationAccuracy: list.filter((c) => c.classificationCorrect).length / list.length,
    }))
    .sort((a, b) => b.count - a.count);
}
