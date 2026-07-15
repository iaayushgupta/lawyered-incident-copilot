// ─────────────────────────────────────────────────────────────────────────────
// Synthetic ground-truth schema.
//
// Every synthetic case carries EXPLICIT ground truth (`expected`) plus a
// pre-computed `simulatedSystemOutput` snapshot used by the evaluation engine.
// The live workflow can also regenerate output through the deterministic
// providers; both are compared to `expected`.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Channel,
  DocFinding,
  DocumentType,
  IncidentType,
  Urgency,
} from "../types";

export type Difficulty = "easy" | "medium" | "hard" | "adversarial";

export interface SyntheticDocumentSpec {
  id: string;
  filename: string;
  claimedType: DocumentType;
  actualType: DocumentType;
  fields: Record<string, string>;
  findings: DocFinding[];
  requiresHumanValidation: boolean;
  originalPreview: string;
  embeddedInstruction?: string;
}

export interface SyntheticIncident {
  id: string;
  title: string;
  description: string;

  channel: Channel;
  originalLanguage: string;
  rawInput: string;

  fleetId: string;
  vehicleId?: string;
  driverId?: string;

  reportedVehicleNumber?: string;
  actualVehicleNumber?: string;
  reportedLocation?: string;
  actualLocation?: string;
  jurisdiction?: string;

  createdAt: string;
  estimatedDowntimePerDay: number;

  documents: SyntheticDocumentSpec[];

  // Explicit ground truth.
  expected: {
    incidentType: IncidentType;
    urgency: Urgency;
    immobilized: boolean;
    suspectedFraud: boolean;
    requiresHumanEscalation: boolean;
    shouldAbstain: boolean;
    requiredDocuments: string[];
    contradictions: string[];
    warnings: string[];
    recommendedLawyerSpecialisation?: string;
  };

  // Pre-baked snapshot of what the deterministic system *did* output, so the
  // dataset is self-contained for evaluation without running the workflow.
  // When present, the evaluation engine uses it directly; the live workflow can
  // also recompute equivalent output through the providers.
  simulatedSystemOutput: {
    incidentType: IncidentType;
    urgency: Urgency;
    confidence: number;
    extractedFields: Record<string, unknown>;
    contradictions: string[];
    suspectedFraud: boolean;
    requiresHumanEscalation: boolean;
    shouldAbstain: boolean;
    recommendedActions: string[];
    sourceIds: string[];
    recommendedLawyerSpecialisation?: string;
  };

  evaluation: {
    expectedFailureModes: string[];
    difficulty: Difficulty;
    tags: string[];
  };
}

// Convenience: dataset-level tag taxonomy (documented in
// docs/synthetic-data-strategy.md). Kept as a const so the failure explorer and
// eval slices can enumerate them.
export const DATASET_TAGS = [
  "valid",
  "incomplete",
  "contradictory",
  "multilingual",
  "transliterated_hindi",
  "poor_grammar",
  "abbreviations",
  "unclear_location",
  "wrong_vehicle_number",
  "multiple_vehicles",
  "multiple_incidents",
  "delayed_upload",
  "duplicate_document",
  "corrupted_document",
  "low_quality_image",
  "stale_document",
  "expired_permit",
  "appears_expired_valid",
  "wrong_document_type",
  "mismatched_driver",
  "mismatched_owner",
  "incorrect_ocr",
  "misleading_filename",
  "fake_notice",
  "altered_date",
  "forged_signature",
  "copied_document",
  "unsupported_jurisdiction",
  "conflicting_laws",
  "missing_source",
  "unknown_incident",
  "overconfident_wrong",
  "prompt_injection",
  "malicious_document",
  "bypass_approval_request",
  "delete_audit_request",
  "fabricate_source_request",
  "mark_verified_request",
  "misrepresent_transcript_request",
  "coercion",
  "sarcasm",
  "emotional",
  "irrelevant",
  "accidental_upload",
  "empty_message",
  "very_long_message",
  "repeat_reporter",
  "coordinated_fraud",
] as const;

export type DatasetTag = (typeof DATASET_TAGS)[number];
