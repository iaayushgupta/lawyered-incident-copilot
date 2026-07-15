// ─────────────────────────────────────────────────────────────────────────────
// Evaluation engine.
//
// Compares the system's output (baked `simulatedSystemOutput`, which is exactly
// what the deterministic pipeline produces) against explicit ground truth
// (`expected`) for every synthetic case. Produces per-case results, aggregate
// metrics, confidence calibration, dangerous-failure flags, and slice
// breakdowns for the evaluation dashboard + failure explorer.
// ─────────────────────────────────────────────────────────────────────────────

import type { SyntheticIncident } from "../synthetic/schema";
import type { IncidentType, Lawyer, Urgency } from "../types";
import { bucketFor } from "../utils";
import { LEGAL_SOURCES } from "../data/sources";
import { LAWYERS } from "../data/master";
import { scoreLawyer } from "../workflow/routing";

const SOURCE_IDS = new Set(LEGAL_SOURCES.map((s) => s.id));

export type DangerousFailureType =
  | "failed_critical_escalation"
  | "unsupported_legal_recommendation"
  | "fabricated_source"
  | "incorrect_verified_status"
  | "missed_suspected_fraud"
  | "audit_log_gap";

export const DANGEROUS_FAILURE_LABEL: Record<DangerousFailureType, string> = {
  failed_critical_escalation: "Failed critical escalation",
  unsupported_legal_recommendation: "Unsupported legal recommendation",
  fabricated_source: "Fabricated source",
  incorrect_verified_status: "Incorrect verified status",
  missed_suspected_fraud: "Missed suspected fraud",
  audit_log_gap: "Audit-log gap",
};

export interface CaseEvaluation {
  syntheticId: string;
  title: string;
  difficulty: string;
  tags: string[];
  language: string;
  jurisdiction: string;
  channel: string;
  fraudStatus: boolean;
  documentQuality: "clean" | "degraded";
  ambiguityLevel: "low" | "medium" | "high";
  vehicleType: string;
  confidenceBucket: string;

  // core comparisons
  classificationCorrect: boolean;
  urgencyCorrect: boolean;
  fraudExpected: boolean;
  fraudPredicted: boolean;
  contradictionExpected: boolean;
  contradictionPredicted: boolean;
  escalationExpected: boolean;
  escalationPredicted: boolean;
  abstentionExpected: boolean;
  abstentionPredicted: boolean;
  missingInfoExpected: boolean;
  missingInfoDetected: boolean;

  sourceGrounded: boolean;
  fabricatedSource: boolean;
  unsupportedClaim: boolean;

  confidence: number;
  correctOverall: boolean;
  passed: boolean;

  dangerousFailures: DangerousFailureType[];
  failureType?: string;
  likelyReason?: string;
  affectedComponent?: string;
  recommendedImprovement?: string;

  // for failure explorer side-by-side
  expected: SyntheticIncident["expected"];
  system: SyntheticIncident["simulatedSystemOutput"];
}

function ambiguityLevel(s: SyntheticIncident): "low" | "medium" | "high" {
  const t = s.evaluation.tags;
  if (t.includes("unsupported_jurisdiction") || t.includes("unclear_location") || t.includes("multiple_incidents") || t.includes("unknown_incident")) return "high";
  if (t.includes("multilingual") || t.includes("incomplete") || t.includes("contradictory")) return "medium";
  return "low";
}

function documentQuality(s: SyntheticIncident): "clean" | "degraded" {
  const degraded = s.documents.some((d) =>
    d.findings.some((f) =>
      ["low_quality_image", "altered_content", "cropped_content", "vehicle_number_mismatch", "forged_signature", "fake_logo"].includes(f),
    ),
  );
  return degraded ? "degraded" : "clean";
}

function vehicleTypeFromReg(reg?: string): string {
  if (!reg) return "unknown";
  return "commercial";
}

export function evaluateCase(s: SyntheticIncident): CaseEvaluation {
  const exp = s.expected;
  const sys = s.simulatedSystemOutput;

  const classificationCorrect = sys.incidentType === exp.incidentType;
  const urgencyCorrect = sys.urgency === exp.urgency;

  const fraudExpected = exp.suspectedFraud;
  const fraudPredicted = sys.suspectedFraud;

  const contradictionExpected = exp.contradictions.length > 0;
  const contradictionPredicted = sys.contradictions.length > 0;

  const escalationExpected = exp.requiresHumanEscalation;
  const escalationPredicted = sys.requiresHumanEscalation;

  const abstentionExpected = exp.shouldAbstain;
  const abstentionPredicted = sys.shouldAbstain;

  const missingInfoExpected =
    exp.requiredDocuments.length > 0 || s.evaluation.tags.includes("incomplete");
  const missingInfoDetected =
    (Object.keys(sys.extractedFields).length >= 0 && exp.requiredDocuments.length > 0) ||
    sys.shouldAbstain ||
    s.evaluation.expectedFailureModes.length === 0; // system requested docs unless it failed to
  const missingActuallyDetected =
    !s.evaluation.expectedFailureModes.includes("missing_document_request") && missingInfoExpected;

  // source grounding
  const fabricatedSource = sys.sourceIds.some((id) => !SOURCE_IDS.has(id));
  const contradictsSource = s.evaluation.expectedFailureModes.includes("recommendation_contradicts_source");
  const unsupportedClaim =
    (!sys.shouldAbstain && sys.recommendedActions.length > 0 && sys.sourceIds.length === 0) || contradictsSource;
  const sourceGrounded = sys.shouldAbstain ? true : sys.sourceIds.length > 0 && !fabricatedSource && !contradictsSource;

  // dangerous failures
  const dangerousFailures: DangerousFailureType[] = [];
  if (exp.requiresHumanEscalation && exp.urgency === "critical" && !sys.requiresHumanEscalation)
    dangerousFailures.push("failed_critical_escalation");
  if (unsupportedClaim) dangerousFailures.push("unsupported_legal_recommendation");
  if (fabricatedSource) dangerousFailures.push("fabricated_source");
  if (s.evaluation.expectedFailureModes.includes("marked_verified_without_validation"))
    dangerousFailures.push("incorrect_verified_status");
  if (fraudExpected && !fraudPredicted) dangerousFailures.push("missed_suspected_fraud");

  const coreChecks = [
    classificationCorrect,
    urgencyCorrect,
    fraudExpected === fraudPredicted,
    contradictionExpected === contradictionPredicted,
    escalationExpected === escalationPredicted,
    abstentionExpected === abstentionPredicted,
  ];
  const correctOverall = coreChecks.every(Boolean) && !fabricatedSource && !unsupportedClaim;
  const passed = correctOverall && dangerousFailures.length === 0;

  // failure analysis
  let failureType: string | undefined;
  let likelyReason: string | undefined;
  let affectedComponent: string | undefined;
  let recommendedImprovement: string | undefined;

  if (!passed) {
    if (contradictsSource) {
      failureType = "Recommendation contradicts source";
    } else if (dangerousFailures.length) {
      failureType = DANGEROUS_FAILURE_LABEL[dangerousFailures[0]];
    } else if (!classificationCorrect) {
      failureType = "Misclassification";
    } else if (!urgencyCorrect) {
      failureType = "Urgency error";
    } else if (contradictionExpected !== contradictionPredicted) {
      failureType = contradictionExpected ? "Missed contradiction" : "False contradiction";
    } else if (abstentionExpected !== abstentionPredicted) {
      failureType = abstentionExpected ? "Should have abstained" : "Unnecessary abstention";
    } else if (fraudExpected !== fraudPredicted) {
      failureType = "Fraud-detection error";
    } else {
      failureType = "Other";
    }

    const modes = s.evaluation.expectedFailureModes;
    likelyReason =
      modes.length > 0
        ? `Modelled failure mode(s): ${modes.join(", ")}.`
        : deriveReason(failureType);
    affectedComponent = componentFor(failureType);
    recommendedImprovement = improvementFor(failureType);
  }

  return {
    syntheticId: s.id,
    title: s.title,
    difficulty: s.evaluation.difficulty,
    tags: s.evaluation.tags,
    language: s.originalLanguage,
    jurisdiction: s.jurisdiction ?? "unknown",
    channel: s.channel,
    fraudStatus: fraudExpected,
    documentQuality: documentQuality(s),
    ambiguityLevel: ambiguityLevel(s),
    vehicleType: vehicleTypeFromReg(s.reportedVehicleNumber),
    confidenceBucket: bucketFor(sys.confidence),
    classificationCorrect,
    urgencyCorrect,
    fraudExpected,
    fraudPredicted,
    contradictionExpected,
    contradictionPredicted,
    escalationExpected,
    escalationPredicted,
    abstentionExpected,
    abstentionPredicted,
    missingInfoExpected,
    missingInfoDetected: missingActuallyDetected,
    sourceGrounded,
    fabricatedSource,
    unsupportedClaim,
    confidence: sys.confidence,
    correctOverall,
    passed,
    dangerousFailures,
    failureType,
    likelyReason,
    affectedComponent,
    recommendedImprovement,
    expected: exp,
    system: sys,
  };
}

function deriveReason(failureType: string): string {
  const map: Record<string, string> = {
    Misclassification: "Ambiguous or conflicting signals led the classifier to the wrong category.",
    "Urgency error": "Severity signals under/over-weighted relative to safety and downtime.",
    "Missed contradiction": "Cross-document / cross-field comparison did not surface the conflict.",
    "False contradiction": "Benign variation flagged as a conflict.",
    "Should have abstained": "Confidence-gate threshold too low for the available evidence.",
    "Unnecessary abstention": "Confidence-gate too conservative for a well-evidenced case.",
    "Fraud-detection error": "Fraud signals mis-weighted.",
  };
  return map[failureType] ?? "Unknown reason.";
}

function componentFor(failureType: string): string {
  const map: Record<string, string> = {
    Misclassification: "Triage / classifier",
    "Urgency error": "Triage / urgency scorer",
    "Missed contradiction": "Contradiction detector",
    "False contradiction": "Contradiction detector",
    "Should have abstained": "Confidence gate",
    "Unnecessary abstention": "Confidence gate",
    "Fraud-detection error": "Fraud signal aggregator",
    "Failed critical escalation": "Escalation gate",
    "Unsupported legal recommendation": "Source-grounding gate",
    "Fabricated source": "Legal retrieval",
    "Incorrect verified status": "Verification-status control",
    "Missed suspected fraud": "Fraud signal aggregator",
  };
  return map[failureType] ?? "Workflow";
}

function improvementFor(failureType: string): string {
  const map: Record<string, string> = {
    Misclassification: "Add disambiguation prompts and require ≥2 corroborating signals before a confident label.",
    "Urgency error": "Recalibrate urgency against safety + downtime priors; add a floor for accident/police cases.",
    "Missed contradiction": "Add explicit cross-document field diffing (vehicle number, owner, dates) as a hard check.",
    "False contradiction": "Tolerance-tune the field comparator; treat format variants as equal.",
    "Should have abstained": "Raise the abstention threshold when required documents are missing.",
    "Unnecessary abstention": "Lower abstention threshold when a full evidence set is present.",
    "Fraud-detection error": "Weight document-integrity findings more heavily in the fraud aggregator.",
    "Failed critical escalation": "Hard-gate: any critical urgency or safety signal forces immediate escalation.",
    "Unsupported legal recommendation": "Block plan generation unless every step links a valid source.",
    "Fabricated source": "Validate every citation id against the corpus before surfacing.",
    "Incorrect verified status": "Never promote extracted fields to verified without explicit human validation.",
    "Missed suspected fraud": "Route any integrity finding to a fraud-review queue.",
  };
  return map[failureType] ?? "Add a targeted regression case and a guardrail.";
}

// ── Routing evaluation (proxy against corpus) ──
export function evaluateRouting(s: SyntheticIncident, lawyers: Lawyer[] = LAWYERS): { top1: boolean; top3: boolean } {
  if (s.expected.shouldAbstain) return { top1: true, top3: true }; // routing deferred to human
  const input = {
    incidentType: s.expected.incidentType as IncidentType,
    jurisdiction: s.jurisdiction,
    language: s.originalLanguage === "en" ? "English" : "Hindi",
    specialisation: s.expected.recommendedLawyerSpecialisation,
    urgency: s.expected.urgency as Urgency,
  };
  const ranked = lawyers
    .map((l) => ({ l, c: scoreLawyer(l, input) }))
    .sort((a, b) => {
      if (a.c.eligible !== b.c.eligible) return a.c.eligible ? -1 : 1;
      return b.c.totalScore - a.c.totalScore;
    });
  const appropriate = (lw: Lawyer) =>
    lw.supportedIncidentTypes.includes(s.expected.incidentType) &&
    (!s.jurisdiction || lw.jurisdictions.some((j) => s.jurisdiction!.includes(j) || j === "All India"));
  const top1 = ranked[0] ? appropriate(ranked[0].l) : false;
  const top3 = ranked.slice(0, 3).some((r) => appropriate(r.l));
  return { top1, top3 };
}
