// ─────────────────────────────────────────────────────────────────────────────
// Triage engine.
//
// Combines the "system belief" (baked simulatedSystemOutput, which may be wrong
// on purpose) with runtime fault perturbation. The eval engine compares this
// output to ground truth. Gate decisions (abstain / escalate / fraud) reflect
// what the SYSTEM reported — not a corrected oracle — so deliberate-failure
// cases remain visible to evaluation.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IncidentDocument,
  IncidentType,
  IncidentUnderstanding,
  TriageResult,
  Urgency,
} from "../types";
import type { SyntheticIncident } from "../synthetic/schema";
import { type FaultConfig, NO_FAULTS } from "../providers/faults";
import { INCIDENT_TYPE_LABEL } from "../types";

const ALL_TYPES: IncidentType[] = Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[];

export function runTriage(
  s: SyntheticIncident,
  understanding: IncidentUnderstanding,
  documents: IncidentDocument[],
  faults: FaultConfig = NO_FAULTS,
): TriageResult {
  const baked = s.simulatedSystemOutput;

  let incidentType = baked.incidentType;
  let confidence = baked.confidence;

  if (faults.has("incorrect_classification")) {
    // Flip to a plausible neighbour.
    const alt = ALL_TYPES.find((t) => t !== incidentType) ?? incidentType;
    incidentType = alt;
    confidence = Math.min(confidence, 0.7);
  }
  if (faults.has("overconfidence")) confidence = Math.max(confidence, 0.93);

  const urgency: Urgency = baked.urgency;

  // Fraud signals (surfaced as evidence, not a verdict).
  const fraudSignals: string[] = [];
  for (const d of documents) {
    for (const f of d.findings) {
      if (["altered_content", "forged_signature", "fake_logo", "duplicate_document", "metadata_inconsistency"].includes(f)) {
        fraudSignals.push(`${d.source.filename}: ${f.replace(/_/g, " ")}`);
      }
    }
  }
  if (s.evaluation.tags.includes("coordinated_fraud")) fraudSignals.push("Pattern consistent with coordinated fraud across records.");

  const suspectedFraud = baked.suspectedFraud;

  const financialRiskPerDay = s.estimatedDowntimePerDay;
  const immobilized = s.expected.immobilized;

  const legalRiskLevel: TriageResult["legalRiskLevel"] =
    urgency === "critical" ? "high" : urgency === "high" ? "high" : urgency === "medium" ? "medium" : "low";
  const driverSafetyRisk: TriageResult["driverSafetyRisk"] =
    incidentType === "accident" || incidentType === "police_interaction" || incidentType === "bribery_demand"
      ? urgency === "critical"
        ? "high"
        : "medium"
      : "low";

  return {
    incidentType,
    incidentTypeConfidence: confidence,
    subcategory: baked.recommendedLawyerSpecialisation,
    urgency,
    immobilized,
    legalRiskLevel,
    driverSafetyRisk,
    financialRiskPerDay,
    missingEvidence: understanding.missingRequiredFields.concat(
      s.expected.requiredDocuments.filter((d) => !documents.some((doc) => doc.classification.includes(d.slice(0, 3)))),
    ),
    contradictions: baked.contradictions,
    suspectedFraud,
    fraudSignals,
    confidence,
    shouldAbstain: baked.shouldAbstain,
    abstainReason: baked.shouldAbstain ? "System confidence below reliable-recommendation threshold." : undefined,
    requiresHumanEscalation: baked.requiresHumanEscalation,
    escalationReason: baked.requiresHumanEscalation
      ? urgency === "critical"
        ? "Critical urgency / safety or immobilization risk."
        : "Contradiction or fraud signal requires human judgment."
      : undefined,
  };
}

// Safety gate used by the INTERACTIVE workflow (conservative — independent of
// whether the system's own gate was correct). High-risk always needs a human.
export function requiresApprovalGate(triage: TriageResult): boolean {
  return (
    triage.urgency === "critical" ||
    triage.urgency === "high" ||
    triage.suspectedFraud ||
    triage.contradictions.length > 0 ||
    triage.requiresHumanEscalation ||
    triage.confidence < 0.7
  );
}
