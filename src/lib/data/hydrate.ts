// ─────────────────────────────────────────────────────────────────────────────
// World hydration (synchronous).
//
// Turns a SyntheticIncident into a fully-populated runtime Incident snapshot:
// understanding, documents, evidence, triage, action plan, routing, reviews,
// resolution, workflow events, and audit entries. The workflow STATE each case
// lands in is assigned deterministically so the seeded dashboard shows a
// realistic mix of in-flight and resolved cases.
//
// The async mock providers (providers/mock.ts) remain the path for the live,
// fault-injectable "re-run" demo. Hydration builds the initial world snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ActionPlan,
  ActionStep,
  AuditEntry,
  EvidenceRecord,
  ExtractedField,
  Incident,
  IncidentDocument,
  IncidentUnderstanding,
  LawyerReview,
  Resolution,
  Role,
  SlaState,
  WorkflowEvent,
  WorkflowState,
} from "../types";
import type { SyntheticIncident } from "../synthetic/schema";
import { NOW, rngFromString, shortHash } from "../utils";
import { runTriage } from "../workflow/triage";
import { routeIncident } from "../workflow/routing";
import { DISCLAIMER, PROHIBITED } from "../providers/mock";
import { appendAudit, type AuditInput } from "../audit";
import { LEGAL_SOURCES } from "./sources";
import { LAWYERS } from "./master";
import { slaMinutesFor } from "./incidents";

const SOURCE_IDS = new Set(LEGAL_SOURCES.map((s) => s.id));

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function hydrateUnderstanding(s: SyntheticIncident): IncidentUnderstanding {
  const rng = rngFromString("u:" + s.id);
  const baked = s.simulatedSystemOutput;
  const translated = s.originalLanguage !== "en" ? `[AI translation of ${s.originalLanguage}] ${s.rawInput}` : undefined;

  const fields: ExtractedField[] = Object.entries(baked.extractedFields).map(([key, value]) => ({
    key,
    label: humanizeKey(key),
    value,
    confidence: round(0.6 + rng() * 0.35),
    provenance: "extracted_fields",
    reviewStatus: "unreviewed",
  }));

  return {
    detectedLanguage: s.evaluation.expectedFailureModes.includes("language_misdetection")
      ? s.originalLanguage === "en" ? "hi" : "en"
      : s.originalLanguage,
    detectedLanguageConfidence: round(0.85 + rng() * 0.13),
    translatedText: translated,
    translationChangedMeaning: s.evaluation.expectedFailureModes.includes("translation_meaning_change"),
    fields,
    missingRequiredFields: s.reportedVehicleNumber ? [] : ["vehicle_number"],
    ambiguityWarnings: s.expected.warnings.filter((w) => /ambig|unclear|multiple|border|interpret|cannot|unknown/i.test(w)),
    followUpQuestions: s.expected.requiredDocuments.map((d) => `Please upload: ${d}.`).slice(0, 5),
    possibleMultipleIncidents: s.evaluation.tags.includes("multiple_incidents"),
  };
}

export function hydrateDocuments(s: SyntheticIncident): IncidentDocument[] {
  return s.documents.map((d) => {
    const rng = rngFromString("d:" + d.id);
    const fields: ExtractedField[] = Object.entries(d.fields).map(([key, value]) => ({
      key,
      label: humanizeKey(key),
      value,
      confidence: round(d.findings.includes("low_quality_image") ? 0.55 + rng() * 0.1 : 0.82 + rng() * 0.16),
      provenance: "extracted_fields",
      reviewStatus: "unreviewed",
    }));
    const expiryStatus: IncidentDocument["expiryStatus"] = d.findings.includes("expired")
      ? "expired"
      : d.findings.includes("appears_expired_but_valid")
        ? "appears_expired_but_valid"
        : d.fields["valid_through"] || d.fields["expiry"]
          ? "valid"
          : "unknown";
    const dangerous = ["altered_content", "vehicle_number_mismatch", "owner_mismatch", "forged_signature", "fake_logo", "embedded_instruction", "hidden_text", "duplicate_document", "cropped_content", "metadata_inconsistency"];
    return {
      id: `doc-${d.id}`,
      incidentId: s.id,
      source: {
        id: d.id,
        filename: d.filename,
        claimedType: d.claimedType,
        actualType: d.actualType,
        groundTruthFields: d.fields,
        groundTruthFindings: d.findings,
        requiresHumanValidation: d.requiresHumanValidation,
        originalPreview: d.originalPreview,
        embeddedInstruction: d.embeddedInstruction,
      },
      classification: d.actualType,
      classificationConfidence: round(d.findings.includes("wrong_document_type") ? 0.52 : 0.9 + rng() * 0.09),
      extractedFields: fields,
      findings: d.findings,
      expiryStatus,
      requiresHumanValidation: d.requiresHumanValidation || d.findings.some((f) => dangerous.includes(f)),
      fileHash: shortHash(d.id + d.filename),
      uploadedAt: s.createdAt,
      uploadedBy: "driver",
      sourceChannel: "document_upload",
      deviceMetadata: ["Android 13 • WhatsApp export", "iOS 17 • Files share", "Android 12 • Camera scan"][Math.floor(rng() * 3)],
    };
  });
}

export function hydrateEvidence(s: SyntheticIncident, docs: IncidentDocument[]): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  const push = (label: string, provenance: EvidenceRecord["provenance"], content: string, opts: Partial<EvidenceRecord> = {}) => {
    records.push({
      id: `ev-${s.id}-${records.length + 1}`,
      incidentId: s.id,
      label,
      provenance,
      fileHash: shortHash(s.id + label),
      uploadedAt: s.createdAt,
      uploadedBy: "driver",
      sourceChannel: s.channel,
      deviceMetadata: `${s.channel} • synthetic device`,
      transformationHistory: opts.transformationHistory ?? [],
      chainOfCustody: [
        { at: s.createdAt, actor: "driver", event: "captured" },
        { at: s.createdAt, actor: "system", event: "ingested" },
      ],
      fullConversationPreserved: opts.fullConversationPreserved ?? true,
      contextMayBeMissing: opts.contextMayBeMissing ?? false,
      content,
    });
  };

  // Original input — always preserved, authoritative.
  push("Original reporter message", "user_statement", s.rawInput, {
    fullConversationPreserved: !s.evaluation.tags.includes("accidental_upload"),
    contextMayBeMissing: s.evaluation.tags.includes("accidental_upload") || s.channel === "voice_note",
  });

  if (s.channel === "voice_note" || s.originalLanguage !== "en") {
    push("AI transcript", "ai_transcript", `[Machine transcript] ${s.rawInput}`, {
      transformationHistory: ["speech/text → transcript (mock)"],
      contextMayBeMissing: true,
    });
  }
  if (s.originalLanguage !== "en") {
    push("AI translation", "ai_translation", `[AI translation of ${s.originalLanguage}] ${s.rawInput}`, {
      transformationHistory: [`translate ${s.originalLanguage} → en (mock)`],
    });
  }
  for (const d of docs) {
    push(`Original file: ${d.source.filename}`, "original_file", d.source.originalPreview, {
      transformationHistory: [],
    });
  }
  return records;
}

export function hydrateActionPlan(s: SyntheticIncident, triageUrgency: string): ActionPlan {
  const baked = s.simulatedSystemOutput;
  if (baked.shouldAbstain) {
    return {
      incidentId: s.id,
      abstained: true,
      abstentionReason: mapAbstention(s),
      driverInstructions: ["Stay safe and await human review."],
      documentsToCollect: s.expected.requiredDocuments,
      legalQuestionsToVerify: [],
      escalationLevel: s.expected.requiresHumanEscalation ? "immediate" : "urgent",
      suggestedLawyerSpecialisation: baked.recommendedLawyerSpecialisation,
      steps: [],
      sourceIds: [],
      confidence: baked.confidence,
      assumptions: [],
      unresolvedContradictions: baked.contradictions,
      prohibitedActions: PROHIBITED,
      requiresHumanApproval: true,
      disclaimer: DISCLAIMER,
    };
  }
  const sourceIds = baked.sourceIds;
  const steps: ActionStep[] = baked.recommendedActions.map((action, i) => {
    const assigned = sourceIds.length ? [sourceIds[i % sourceIds.length]] : [];
    return {
      id: `step-${s.id}-${i + 1}`,
      order: i + 1,
      title: action.length <= 46 ? action : action.slice(0, 45) + "…",
      detail: action,
      sourceIds: assigned,
      confidence: round(Math.max(0, Math.min(1, baked.confidence - 0.02 * i))),
      assumptions: i === 0 ? assumptionsFor(s) : [],
      markedUnsupported: assigned.length === 0,
    };
  });
  return {
    incidentId: s.id,
    abstained: false,
    driverInstructions: [
      s.expected.urgency === "critical" ? "Ensure your personal safety first." : "Stay calm; keep the vehicle stationary if safe.",
      "Do not sign any admission or pay any unofficial amount.",
      "Share clear photos of any notice handed over.",
    ],
    documentsToCollect: s.expected.requiredDocuments,
    legalQuestionsToVerify: ["Confirm the statutory basis of the action taken."],
    escalationLevel: s.expected.requiresHumanEscalation || triageUrgency === "critical" ? "immediate" : triageUrgency === "high" ? "urgent" : "standard",
    suggestedLawyerSpecialisation: baked.recommendedLawyerSpecialisation ?? s.expected.recommendedLawyerSpecialisation,
    steps,
    sourceIds,
    confidence: baked.confidence,
    assumptions: assumptionsFor(s),
    unresolvedContradictions: baked.contradictions,
    prohibitedActions: PROHIBITED,
    requiresHumanApproval: true,
    disclaimer: DISCLAIMER,
  };
}

function assumptionsFor(s: SyntheticIncident): string[] {
  const a = ["Assumes uploaded documents are originals unless flagged for validation."];
  if (s.reportedLocation) a.push(`Assumes location is ${s.reportedLocation} as reported.`);
  return a;
}
function mapAbstention(s: SyntheticIncident): ActionPlan["abstentionReason"] {
  const t = s.evaluation.tags;
  if (s.expected.requiresHumanEscalation && s.expected.urgency === "critical") return "immediate_lawyer_intervention_required";
  if (t.includes("unsupported_jurisdiction")) return "unsupported_jurisdiction";
  if (t.includes("contradictory") || s.expected.contradictions.length > 1) return "conflicting_evidence";
  if (t.includes("missing_source") || t.includes("unknown_incident")) return "no_reliable_recommendation";
  return "insufficient_evidence";
}

// ── State assignment ──
// Deterministically place each case at a plausible point in its lifecycle.
function assignState(s: SyntheticIncident): WorkflowState {
  if (s.simulatedSystemOutput.shouldAbstain) return "abstained";
  if (s.evaluation.expectedFailureModes.includes("provider_timeout")) return "failed";
  const r = rngFromString("state:" + s.id)();
  if (r < 0.24) return "resolved";
  if (r < 0.34) return "in_resolution";
  if (r < 0.46) return "lawyer_assigned";
  if (r < 0.66) return "human_review_required";
  if (r < 0.76) return "action_plan_generated";
  if (r < 0.86) return "awaiting_information";
  return "triage_complete";
}

function slaState(s: SyntheticIncident, dueAt: string, state: WorkflowState): SlaState {
  if (state === "resolved" || state === "closed") return "met";
  const due = new Date(dueAt).getTime();
  const now = NOW.getTime();
  if (now > due) return "breached";
  if (due - now < (slaMinutesFor(s.expected.urgency) * 60000) * 0.25) return "at_risk";
  return "on_track";
}

export function hydrateIncident(s: SyntheticIncident): { incident: Incident; events: WorkflowEvent[]; audit: AuditEntry[] } {
  const understanding = hydrateUnderstanding(s);
  const documents = hydrateDocuments(s);
  const triage = runTriage(s, understanding, documents);
  const evidence = hydrateEvidence(s, documents);
  const state = assignState(s);

  const slaMin = slaMinutesFor(s.expected.urgency);
  const slaDueAt = new Date(new Date(s.createdAt).getTime() + slaMin * 60000).toISOString();

  const caseNumber = "L247-" + shortHash(s.id, 4).toUpperCase();

  const base: Incident = {
    id: s.id,
    caseNumber,
    title: s.title,
    createdAt: s.createdAt,
    fleetId: s.fleetId,
    vehicleId: s.vehicleId,
    driverId: s.driverId,
    channel: s.channel,
    originalLanguage: s.originalLanguage,
    rawInput: s.rawInput,
    reportedVehicleNumber: s.reportedVehicleNumber,
    reportedLocation: s.reportedLocation,
    jurisdiction: s.jurisdiction,
    state,
    urgency: s.expected.urgency,
    slaState: slaState(s, slaDueAt, state),
    slaDueAt,
    understanding,
    triage,
    documents,
    evidence,
    reviews: [],
    estimatedDowntimePerDay: s.estimatedDowntimePerDay,
    confidence: s.simulatedSystemOutput.confidence,
    suspectedFraud: s.simulatedSystemOutput.suspectedFraud,
    syntheticId: s.id,
  };

  const reached = (target: WorkflowState) => statePast(state, target);

  // Populate downstream artifacts based on how far the case has progressed.
  if (reached("action_plan_generated") && state !== "abstained") {
    base.actionPlan = hydrateActionPlan(s, triage.urgency);
  }
  if (state === "abstained") {
    base.actionPlan = hydrateActionPlan(s, triage.urgency);
  }
  if (reached("lawyer_assigned")) {
    base.routing = routeIncident(base, LAWYERS);
    base.assignedLawyerId = base.routing.recommendedLawyerId;
  }
  const reviews: LawyerReview[] = [];
  if (reached("lawyer_assigned") && base.assignedLawyerId) {
    reviews.push({
      id: `rev-${s.id}-1`,
      incidentId: s.id,
      lawyerId: base.assignedLawyerId,
      decision: s.evaluation.expectedFailureModes.length > 0 ? "edited" : "approved",
      at: new Date(new Date(s.createdAt).getTime() + slaMin * 60000 * 0.8).toISOString(),
      note: s.evaluation.expectedFailureModes.length > 0 ? "Corrected AI output before proceeding." : "Plan approved for execution.",
    });
  }
  base.reviews = reviews;

  if (state === "resolved") {
    base.resolution = hydrateResolution(s, base);
  }

  const { events, audit } = buildHistory(s, base, state);
  return { incident: base, events, audit };
}

function hydrateResolution(s: SyntheticIncident, incident: Incident): Resolution {
  const rng = rngFromString("res:" + s.id);
  const accepted = s.evaluation.expectedFailureModes.length === 0 && !s.expected.suspectedFraud;
  const ttr = Math.round(30 + rng() * 90);
  return {
    incidentId: s.id,
    finalIncidentType: s.expected.incidentType,
    finalActionTaken: accepted ? "Resolved per approved action plan." : "Resolved after lawyer correction of AI output.",
    timeToFirstResponseMin: Math.round(2 + rng() * 6),
    timeToLawyerAssignmentMin: Math.round(6 + rng() * 14),
    timeToResolutionMin: ttr,
    vehicleDowntimeMin: ttr + Math.round(rng() * 40),
    finalPenalty: Math.round(incident.estimatedDowntimePerDay * (0.05 + rng() * 0.2)),
    avoidedCost: Math.round(incident.estimatedDowntimePerDay * (0.3 + rng() * 0.5)),
    aiRecommendationAccepted: accepted,
    lawyerCorrections: accepted ? [] : (s.expected.contradictions.length ? s.expected.contradictions : ["Adjusted classification/urgency."]),
    failureCategory: s.evaluation.expectedFailureModes[0],
    userFeedback: accepted ? "Fast and clear." : "Needed lawyer to correct details.",
  };
}

function statePast(current: WorkflowState, target: WorkflowState): boolean {
  const order: WorkflowState[] = [
    "incident_created", "intake_processing", "awaiting_information", "documents_received",
    "document_validation", "triage_complete", "legal_retrieval", "action_plan_generated",
    "human_review_required", "lawyer_assigned", "in_resolution", "resolved", "closed",
  ];
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ci < 0 || ti < 0) return current === "abstained" && target === "action_plan_generated" ? false : false;
  return ci >= ti;
}

function buildHistory(s: SyntheticIncident, incident: Incident, state: WorkflowState): { events: WorkflowEvent[]; audit: AuditEntry[] } {
  const events: WorkflowEvent[] = [];
  const audit: AuditEntry[] = [];
  const t0 = new Date(s.createdAt).getTime();
  let step = 0;
  const at = () => new Date(t0 + (step++) * 90000).toISOString();

  const path: WorkflowState[] = pathTo(state);
  let prev: WorkflowState = "incident_created";
  for (const st of path) {
    if (st === "incident_created") continue;
    const when = at();
    events.push({
      id: `evt-${s.id}-${events.length + 1}`,
      incidentId: s.id,
      at: when,
      from: prev,
      to: st,
      reason: transitionReason(st),
      actor: st === "lawyer_assigned" || st === "in_resolution" || st === "resolved" ? "lawyer" : "system",
    });
    prev = st;
  }

  // Audit entries for AI outputs + lawyer actions.
  const add = (input: AuditInput, whenIdx: number) =>
    appendAudit(audit, input, new Date(t0 + whenIdx * 90000).toISOString());

  const role = (r: Role) => r;
  add({ incidentId: s.id, actor: "system", actorRole: role("legal_ops"), action: "intake_analysed", after: { language: incident.understanding?.detectedLanguage }, providerVersion: "mock-2026.07", confidence: incident.understanding?.detectedLanguageConfidence, source: "IncidentUnderstandingProvider" }, 1);
  add({ incidentId: s.id, actor: "system", actorRole: role("legal_ops"), action: "triage_generated", after: { incidentType: incident.triage?.incidentType, urgency: incident.triage?.urgency }, providerVersion: "mock-2026.07", confidence: incident.triage?.confidence, source: "TriageEngine" }, 2);
  if (incident.actionPlan) {
    add({ incidentId: s.id, actor: "system", actorRole: role("legal_ops"), action: incident.actionPlan.abstained ? "abstained" : "action_plan_generated", after: { abstained: incident.actionPlan.abstained, sources: incident.actionPlan.sourceIds }, providerVersion: "mock-2026.07", confidence: incident.actionPlan.confidence, source: "RecommendationProvider" }, 3);
  }
  for (const rev of incident.reviews) {
    add({ incidentId: s.id, actor: "lawyer", actorRole: role("lawyer"), action: `lawyer_${rev.decision}`, reason: rev.note, source: rev.lawyerId }, 4);
  }
  if (incident.resolution) {
    add({ incidentId: s.id, actor: "lawyer", actorRole: role("lawyer"), action: "resolved", after: { finalType: incident.resolution.finalIncidentType, accepted: incident.resolution.aiRecommendationAccepted }, source: "Resolution" }, 5);
  }

  return { events, audit };
}

function pathTo(state: WorkflowState): WorkflowState[] {
  if (state === "abstained") return ["incident_created", "intake_processing", "document_validation", "triage_complete", "abstained"];
  if (state === "failed") return ["incident_created", "intake_processing", "failed"];
  const happy: WorkflowState[] = [
    "incident_created", "intake_processing", "documents_received", "document_validation",
    "triage_complete", "legal_retrieval", "action_plan_generated", "human_review_required",
    "lawyer_assigned", "in_resolution", "resolved",
  ];
  const idx = happy.indexOf(state);
  return idx < 0 ? ["incident_created"] : happy.slice(0, idx + 1);
}

function transitionReason(st: WorkflowState): string {
  const map: Partial<Record<WorkflowState, string>> = {
    intake_processing: "Intake received; understanding provider invoked.",
    documents_received: "Documents attached by reporter.",
    document_validation: "Document intelligence completed.",
    triage_complete: "Triage engine produced classification + urgency.",
    legal_retrieval: "Retrieved synthetic legal sources.",
    action_plan_generated: "Grounded action plan drafted.",
    human_review_required: "High-risk gate — lawyer review required.",
    lawyer_assigned: "Routed to recommended lawyer.",
    in_resolution: "Lawyer executing plan.",
    resolved: "Matter resolved; outcome captured.",
    abstained: "System abstained; deferred to human.",
    failed: "Provider failure during processing.",
  };
  return map[st] ?? "State transition.";
}

export { SOURCE_IDS };
