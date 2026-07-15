// ─────────────────────────────────────────────────────────────────────────────
// Deterministic mock providers.
//
// Philosophy: the synthetic dataset is authoritative for "what the AI produced"
// (`simulatedSystemOutput`) — including cases where that output is deliberately
// wrong. These providers surface that baked output wrapped with provenance,
// per-field confidence, and document ground truth, then apply runtime fault
// injection on top. This keeps everything deterministic and lets the evaluation
// engine expose genuine gaps between system output and ground truth.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ActionPlan,
  ActionStep,
  CaseContext,
  ExtractedField,
  IncidentDocument,
  IncidentInput,
  IncidentType,
  IncidentUnderstanding,
  LegalQuery,
  LegalSource,
  SyntheticDocument,
} from "../types";
import { DOC_FINDING_LABEL, DOCUMENT_TYPE_LABEL } from "../types";
import type { SyntheticIncident } from "../synthetic/schema";
import { fnv1a, rngFromString, shortHash } from "../utils";
import {
  ProviderMalformedOutputError,
  ProviderTimeoutError,
  type DocumentExtractionProvider,
  type IncidentUnderstandingProvider,
  type LegalRetrievalProvider,
  type RecommendationProvider,
} from "./interfaces";
import { type FaultConfig, NO_FAULTS } from "./faults";

export interface ProviderData {
  getSynthetic: (id: string) => SyntheticIncident | undefined;
  sources: LegalSource[];
}

const PROVIDER_VERSION = "mock-2026.07";

function digitSwap(value: string): string {
  const chars = value.split("");
  const digitIdx = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (digitIdx.length < 2) return value;
  const a = digitIdx[digitIdx.length - 1];
  const b = digitIdx[digitIdx.length - 2];
  [chars[a], chars[b]] = [chars[b], chars[a]];
  return chars.join("");
}

// ── Understanding provider ──────────────────────────────────────────────────

export class MockUnderstandingProvider implements IncidentUnderstandingProvider {
  readonly version = PROVIDER_VERSION;
  constructor(private data: ProviderData, private faults: FaultConfig = NO_FAULTS) {}

  async analyse(input: IncidentInput): Promise<IncidentUnderstanding> {
    if (this.faults.has("provider_timeout")) throw new ProviderTimeoutError("understanding");
    if (this.faults.has("malformed_json")) throw new ProviderMalformedOutputError("understanding");

    const s = this.data.getSynthetic(input.syntheticId);
    if (!s) throw new Error(`Unknown synthetic id ${input.syntheticId}`);

    const rng = rngFromString("understanding:" + s.id);
    const baked = s.simulatedSystemOutput;

    // Language detection (a case can carry a deliberate misdetection).
    const misdetect = s.evaluation.expectedFailureModes.includes("language_misdetection");
    const detectedLanguage = misdetect
      ? s.originalLanguage === "en"
        ? "hi"
        : "en"
      : s.originalLanguage;

    const translated =
      s.originalLanguage !== "en"
        ? `[AI translation of ${s.originalLanguage}] ${s.rawInput}`
        : undefined;

    // Build extracted fields from baked output.
    const fields: ExtractedField[] = Object.entries(baked.extractedFields).map(([key, value]) => {
      let v = value;
      let conf = 0.6 + rng() * 0.35;
      // OCR digit swap corrupts vehicle numbers but stays confident.
      if (this.faults.has("ocr_digit_swap") && /vehicle|registration|number/i.test(key) && typeof v === "string") {
        v = digitSwap(v);
        conf = 0.91;
      }
      if (this.faults.has("overconfidence")) conf = Math.max(conf, 0.93);
      return {
        key,
        label: humanizeKey(key),
        value: v,
        confidence: round(conf),
        provenance: "extracted_fields",
        reviewStatus: "unreviewed",
      };
    });

    // Required fields depend on incident type.
    const required = requiredFieldsFor(baked.incidentType);
    const present = new Set(fields.map((f) => f.key));
    let missingRequiredFields = required.filter((r) => !present.has(r));
    if (this.faults.has("missing_fields") && fields.length > 0) {
      const dropped = fields.pop()!;
      missingRequiredFields = Array.from(new Set([...missingRequiredFields, dropped.key]));
    }

    const ambiguityWarnings = s.expected.warnings.filter((w) =>
      /ambig|unclear|multiple|border|interpret|cannot determine|unknown authority/i.test(w),
    );

    const followUpQuestions = buildFollowUps(missingRequiredFields, s);

    return {
      detectedLanguage,
      detectedLanguageConfidence: round(misdetect ? 0.58 : 0.9 + rng() * 0.09),
      translatedText: translated,
      translationChangedMeaning: s.evaluation.tags.includes("multilingual")
        ? s.evaluation.expectedFailureModes.includes("translation_meaning_change")
        : false,
      fields,
      missingRequiredFields,
      ambiguityWarnings,
      followUpQuestions,
      possibleMultipleIncidents: s.evaluation.tags.includes("multiple_incidents"),
    };
  }
}

function requiredFieldsFor(type: IncidentType): string[] {
  const base = ["vehicle_number", "location", "authority"];
  const extra: Partial<Record<IncidentType, string[]>> = {
    permit_issue: ["permit_type", "route"],
    accident: ["injuries", "other_party"],
    traffic_challan: ["challan_reason"],
    vehicle_detention: ["detention_reason"],
    bribery_demand: ["amount_demanded"],
    cargo_issue: ["cargo_type"],
    tax_border_issue: ["border_or_tax_type"],
    court_issue: ["court", "hearing_date"],
  };
  return Array.from(new Set([...base, ...(extra[type] ?? [])]));
}

function buildFollowUps(missing: string[], s: SyntheticIncident): string[] {
  const qs: string[] = [];
  for (const m of missing) {
    if (m === "vehicle_number") qs.push("Please confirm the vehicle registration number.");
    else if (m === "location") qs.push("Where exactly was the vehicle stopped (city/highway)?");
    else if (m === "authority") qs.push("Which authority stopped the vehicle (police / RTO / border)?");
    else if (m === "permit_type") qs.push("Is this a national permit or a state permit?");
    else qs.push(`Please provide: ${humanizeKey(m)}.`);
  }
  for (const doc of s.expected.requiredDocuments) qs.push(`Please upload: ${doc}.`);
  return Array.from(new Set(qs)).slice(0, 6);
}

// ── Document extraction provider ────────────────────────────────────────────

export class MockDocumentProvider implements DocumentExtractionProvider {
  readonly version = PROVIDER_VERSION;
  constructor(private faults: FaultConfig = NO_FAULTS) {}

  async extract(document: SyntheticDocument, incidentId: string): Promise<IncidentDocument> {
    if (this.faults.has("provider_timeout")) throw new ProviderTimeoutError("document");

    const rng = rngFromString("doc:" + document.id);
    const findings = [...document.groundTruthFindings];

    // Classification: usually the actual type; wrong_document_type finding lowers confidence.
    const classification = document.actualType;
    let classConf = findings.includes("wrong_document_type") ? 0.52 : 0.9 + rng() * 0.09;
    if (findings.includes("low_quality_image")) classConf = 0.61;
    if (this.faults.has("overconfidence")) classConf = Math.max(classConf, 0.94);

    const extractedFields: ExtractedField[] = Object.entries(document.groundTruthFields).map(
      ([key, value]) => {
        let v: string = value;
        let conf = 0.8 + rng() * 0.18;
        if (findings.includes("low_quality_image")) conf = 0.55 + rng() * 0.1;
        if (this.faults.has("ocr_digit_swap") && /vehicle|reg|number|permit_no/i.test(key)) {
          v = digitSwap(v);
          conf = 0.9; // confident but wrong
          if (!findings.includes("vehicle_number_mismatch")) findings.push("vehicle_number_mismatch");
        }
        if (this.faults.has("overconfidence")) conf = Math.max(conf, 0.93);
        return {
          key,
          label: humanizeKey(key),
          value: v,
          confidence: round(conf),
          provenance: "extracted_fields",
          reviewStatus: "unreviewed",
        };
      },
    );

    const expiryStatus = findings.includes("expired")
      ? "expired"
      : findings.includes("appears_expired_but_valid")
        ? "appears_expired_but_valid"
        : document.groundTruthFields["expiry"] || document.groundTruthFields["valid_through"]
          ? "valid"
          : "unknown";

    // Any adversarial / mismatch finding forces human validation.
    const dangerous: Array<typeof findings[number]> = [
      "altered_content",
      "vehicle_number_mismatch",
      "owner_mismatch",
      "forged_signature",
      "fake_logo",
      "embedded_instruction",
      "hidden_text",
      "duplicate_document",
      "cropped_content",
      "metadata_inconsistency",
    ];
    const requiresHumanValidation =
      document.requiresHumanValidation || findings.some((f) => dangerous.includes(f));

    return {
      id: `doc-${document.id}`,
      incidentId,
      source: document,
      classification,
      classificationConfidence: round(classConf),
      extractedFields,
      findings,
      expiryStatus,
      requiresHumanValidation,
      fileHash: shortHash(document.id + document.filename),
      uploadedAt: new Date().toISOString(),
      uploadedBy: "driver",
      sourceChannel: "document_upload",
      deviceMetadata: pickDevice(rng),
    };
  }
}

function pickDevice(rng: () => number): string {
  const devices = [
    "Android 13 • WhatsApp export",
    "iOS 17 • Files share",
    "Android 12 • Camera scan",
    "Web upload • Chrome",
    "Scanner kiosk • depot",
  ];
  return devices[Math.floor(rng() * devices.length)];
}

// ── Legal retrieval provider ────────────────────────────────────────────────

export class MockRetrievalProvider implements LegalRetrievalProvider {
  readonly version = PROVIDER_VERSION;
  constructor(private data: ProviderData, private faults: FaultConfig = NO_FAULTS) {}

  async retrieve(query: LegalQuery): Promise<LegalSource[]> {
    if (this.faults.has("provider_timeout")) throw new ProviderTimeoutError("retrieval");

    let jurisdiction = query.jurisdiction;
    if (this.faults.has("wrong_jurisdiction")) jurisdiction = "Wrongland";

    let results = this.data.sources.filter(
      (src) =>
        src.appliesToIncidentTypes.includes(query.incidentType) &&
        (!jurisdiction ||
          src.jurisdiction === "All India" ||
          src.jurisdiction === jurisdiction ||
          jurisdiction.includes(src.jurisdiction)),
    );

    if (this.faults.has("hallucinated_citation")) {
      results = [
        ...results,
        {
          id: "SRC-HALLUCINATED-001",
          title: "Fabricated Circular on Roadside Detention (does not exist)",
          citation: "Circular 00/0000 [FABRICATED]",
          kind: "circular",
          jurisdiction: jurisdiction ?? "All India",
          summary: "This citation was injected by the hallucinated_citation fault and has no real referent.",
          appliesToIncidentTypes: [query.incidentType],
          version: "v0",
          synthetic: true,
          isFabricated: true,
        },
      ];
    }

    return results.slice(0, 5);
  }
}

// ── Recommendation provider ─────────────────────────────────────────────────

export class MockRecommendationProvider implements RecommendationProvider {
  readonly version = PROVIDER_VERSION;
  constructor(private data: ProviderData, private faults: FaultConfig = NO_FAULTS) {}

  async generate(context: CaseContext): Promise<ActionPlan> {
    const { incident, triage, sources } = context;
    const s = this.data.getSynthetic(incident.syntheticId);
    if (!s) throw new Error(`Unknown synthetic id ${incident.syntheticId}`);
    const baked = s.simulatedSystemOutput;

    const abstainReason = mapAbstention(s);
    if (baked.shouldAbstain) {
      return {
        incidentId: incident.id,
        abstained: true,
        abstentionReason: abstainReason,
        driverInstructions: ["Stay safe, remain at location if safe, and await human review."],
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

    const sourceIds = this.faults.has("missing_citations")
      ? []
      : baked.sourceIds.length
        ? baked.sourceIds
        : sources.map((x) => x.id);

    const steps: ActionStep[] = baked.recommendedActions.map((action, i) => {
      const assigned = sourceIds.length ? [sourceIds[i % sourceIds.length]] : [];
      return {
        id: `step-${incident.id}-${i + 1}`,
        order: i + 1,
        title: shorten(action),
        detail: action,
        sourceIds: assigned,
        confidence: round(clamp(baked.confidence + (i === 0 ? 0.03 : -0.02 * i))),
        assumptions: i === 0 ? assumptionsFor(s) : [],
        markedUnsupported: assigned.length === 0,
      };
    });

    return {
      incidentId: incident.id,
      abstained: false,
      driverInstructions: driverInstructionsFor(s),
      documentsToCollect: s.expected.requiredDocuments,
      legalQuestionsToVerify: legalQuestionsFor(s),
      escalationLevel: escalationLevelFor(triage?.urgency ?? incident.urgency, s.expected.requiresHumanEscalation),
      suggestedLawyerSpecialisation: baked.recommendedLawyerSpecialisation ?? s.expected.recommendedLawyerSpecialisation,
      steps,
      sourceIds,
      confidence: baked.confidence,
      assumptions: assumptionsFor(s),
      unresolvedContradictions: baked.contradictions,
      prohibitedActions: PROHIBITED,
      requiresHumanApproval: true, // high-risk legal actions ALWAYS require approval
      disclaimer: DISCLAIMER,
    };
  }
}

// ── Helpers / static copy ───────────────────────────────────────────────────

const DISCLAIMER =
  "Machine-generated draft for lawyer review. Synthetic legal sources; not legal advice. The original record remains authoritative.";

const PROHIBITED = [
  "Do not tell the driver to pay any unofficial amount.",
  "Do not represent AI output as a legal determination.",
  "Do not describe uploaded messages or audio as automatically admissible evidence.",
  "Do not confirm a document as verified without human validation.",
];

function mapAbstention(s: SyntheticIncident): ActionPlan["abstentionReason"] {
  const t = s.evaluation.tags;
  if (s.expected.requiresHumanEscalation && s.expected.urgency === "critical")
    return "immediate_lawyer_intervention_required";
  if (t.includes("unsupported_jurisdiction")) return "unsupported_jurisdiction";
  if (t.includes("contradictory") || s.expected.contradictions.length > 1) return "conflicting_evidence";
  if (t.includes("missing_source") || t.includes("unknown_incident")) return "no_reliable_recommendation";
  return "insufficient_evidence";
}

function driverInstructionsFor(s: SyntheticIncident): string[] {
  const out = [
    "Stay calm and keep the vehicle stationary if it is safe to do so.",
    "Do not sign any admission or pay any unofficial amount.",
    "Share clear photos of any notice or document handed over.",
  ];
  if (s.expected.urgency === "critical") out.unshift("Ensure your personal safety first; move to a safe spot if needed.");
  return out;
}

function legalQuestionsFor(s: SyntheticIncident): string[] {
  const map: Partial<Record<IncidentType, string[]>> = {
    permit_issue: [
      "Does the permit cover the current route and state?",
      "Is the cited provision applicable to this vehicle class?",
    ],
    vehicle_detention: ["On what statutory basis was the vehicle detained?"],
    accident: ["Are there injuries requiring mandatory reporting?"],
    bribery_demand: ["Is there any documentation of the demand?"],
    traffic_challan: ["Is the challan amount consistent with the cited section?"],
  };
  return map[s.expected.incidentType] ?? ["Confirm the statutory basis of the action taken."];
}

function assumptionsFor(s: SyntheticIncident): string[] {
  const a = ["Assumes uploaded documents are the originals unless flagged for validation."];
  if (s.reportedLocation) a.push(`Assumes location is ${s.reportedLocation} as reported.`);
  return a;
}

function escalationLevelFor(urgency: string, requiresEscalation: boolean): ActionPlan["escalationLevel"] {
  if (requiresEscalation || urgency === "critical") return "immediate";
  if (urgency === "high") return "urgent";
  if (urgency === "medium") return "standard";
  return "none";
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shorten(text: string, max = 42): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

export { DISCLAIMER, PROHIBITED, DOC_FINDING_LABEL, DOCUMENT_TYPE_LABEL, fnv1a };
