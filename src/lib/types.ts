// ─────────────────────────────────────────────────────────────────────────────
// Domain types — AI Legal Incident Copilot
//
// These types are the single source of truth for the entire prototype. They are
// deliberately explicit about provenance (original vs AI-generated), confidence,
// and review status, because those distinctions are the product's core safety
// contract. See docs/system-design.md for the entity model.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums / unions ───────────────────────────────────────────────────────────

export type Urgency = "low" | "medium" | "high" | "critical";

export type Channel =
  | "whatsapp_text"
  | "voice_note"
  | "call_transcript"
  | "manual"
  | "fleet_api"
  | "document_upload";

export type IncidentType =
  | "permit_issue"
  | "vehicle_document_issue"
  | "driver_document_issue"
  | "traffic_challan"
  | "vehicle_detention"
  | "accident"
  | "police_interaction"
  | "bribery_demand"
  | "cargo_issue"
  | "tax_border_issue"
  | "court_issue"
  | "disputed_vehicle_identity"
  | "possible_fraud"
  | "unknown_unsupported";

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  permit_issue: "Permit issue",
  vehicle_document_issue: "Vehicle-document issue",
  driver_document_issue: "Driver-document issue",
  traffic_challan: "Traffic challan",
  vehicle_detention: "Vehicle detention",
  accident: "Accident",
  police_interaction: "Police interaction",
  bribery_demand: "Alleged unofficial payment demand",
  cargo_issue: "Cargo issue",
  tax_border_issue: "Tax / border issue",
  court_issue: "Court-related issue",
  disputed_vehicle_identity: "Disputed vehicle identity",
  possible_fraud: "Possible fraud",
  unknown_unsupported: "Unknown / unsupported",
};

export type DocumentType =
  | "rc"
  | "driving_licence"
  | "national_permit"
  | "state_permit"
  | "insurance"
  | "puc"
  | "challan"
  | "seizure_notice"
  | "police_notice"
  | "court_notice"
  | "accident_photo"
  | "fleet_assignment"
  | "unknown";

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  rc: "Registration Certificate (RC)",
  driving_licence: "Driving Licence",
  national_permit: "National Permit",
  state_permit: "State Permit",
  insurance: "Insurance",
  puc: "PUC Certificate",
  challan: "Challan",
  seizure_notice: "Seizure Notice",
  police_notice: "Police Notice",
  court_notice: "Court Notice",
  accident_photo: "Accident Photograph",
  fleet_assignment: "Fleet Assignment",
  unknown: "Unknown document",
};

export type Role =
  | "driver"
  | "fleet_operator"
  | "legal_ops"
  | "lawyer"
  | "admin"
  | "auditor";

export const ROLE_LABEL: Record<Role, string> = {
  driver: "Driver",
  fleet_operator: "Fleet Operator",
  legal_ops: "Legal Operations Analyst",
  lawyer: "Lawyer",
  admin: "Administrator",
  auditor: "Auditor",
};

// Workflow states — see lib/workflow/machine.ts
export type WorkflowState =
  | "incident_created"
  | "intake_processing"
  | "awaiting_information"
  | "documents_received"
  | "document_validation"
  | "triage_complete"
  | "legal_retrieval"
  | "action_plan_generated"
  | "human_review_required"
  | "lawyer_assigned"
  | "in_resolution"
  | "resolved"
  | "closed"
  | "abstained"
  | "failed";

export const WORKFLOW_STATE_LABEL: Record<WorkflowState, string> = {
  incident_created: "Incident created",
  intake_processing: "Intake processing",
  awaiting_information: "Awaiting information",
  documents_received: "Documents received",
  document_validation: "Document validation",
  triage_complete: "Triage complete",
  legal_retrieval: "Legal retrieval",
  action_plan_generated: "Action plan generated",
  human_review_required: "Human review required",
  lawyer_assigned: "Lawyer assigned",
  in_resolution: "In resolution",
  resolved: "Resolved",
  closed: "Closed",
  abstained: "Abstained",
  failed: "Failed",
};

export type SlaState = "on_track" | "at_risk" | "breached" | "met";

// Provenance: the safety-critical distinction between original inputs and
// machine-generated derivations.
export type Provenance =
  | "original_file"
  | "user_statement"
  | "ai_transcript"
  | "ai_translation"
  | "ai_summary"
  | "extracted_fields"
  | "lawyer_reviewed";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  original_file: "Original file",
  user_statement: "User-generated statement",
  ai_transcript: "AI-generated transcript",
  ai_translation: "AI-generated translation",
  ai_summary: "AI-generated summary",
  extracted_fields: "Extracted fields",
  lawyer_reviewed: "Lawyer-reviewed record",
};

export type ReviewStatus = "unreviewed" | "verified" | "rejected" | "needs_review";

// ── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceBucket = "very_low" | "low" | "medium" | "high" | "very_high";

export interface ConfidenceValue {
  score: number; // 0..1
  bucket: ConfidenceBucket;
}

// A field extracted by an AI provider. NEVER silently promoted to "verified".
export interface ExtractedField<T = unknown> {
  key: string;
  label: string;
  value: T;
  confidence: number; // 0..1
  provenance: Provenance;
  reviewStatus: ReviewStatus;
  note?: string;
}

// ── Master data ──────────────────────────────────────────────────────────────

export interface Fleet {
  id: string;
  name: string;
  operatingStates: string[];
  vehicleCount: number;
}

export interface Driver {
  id: string;
  fleetId: string;
  name: string;
  phoneMasked: string; // stored already masked
  licenceMasked: string;
  languages: string[];
}

export interface Vehicle {
  id: string;
  fleetId: string;
  registration: string;
  vehicleClass: string;
  type: "goods_carrier" | "passenger" | "tanker" | "container" | "trailer";
}

export interface Lawyer {
  id: string;
  name: string;
  jurisdictions: string[];
  languages: string[];
  specialisations: string[];
  availability: "available" | "busy" | "offline";
  activeCaseload: number;
  medianResponseMinutes: number;
  successRate: number; // 0..1 (simulated)
  costBand: "economy" | "standard" | "premium";
  supportedIncidentTypes: IncidentType[];
  qualityScore: number; // 0..1 (simulated)
  rating: number; // 0..5 display
}

// ── Legal sources (synthetic) ────────────────────────────────────────────────

export interface LegalSource {
  id: string;
  title: string;
  citation: string;
  kind: "statute" | "state_rule" | "circular" | "internal_playbook" | "case_note";
  jurisdiction: string;
  summary: string;
  appliesToIncidentTypes: IncidentType[];
  version: string;
  synthetic: true; // always true in the prototype
  isFabricated?: boolean; // ground-truth marker used by eval when a provider hallucinates
}

// ── Documents ────────────────────────────────────────────────────────────────

export type DocFinding =
  | "expired"
  | "appears_expired_but_valid"
  | "vehicle_number_mismatch"
  | "owner_mismatch"
  | "date_inconsistency"
  | "suspicious_formatting"
  | "altered_content"
  | "duplicate_document"
  | "wrong_document_type"
  | "missing_sections"
  | "embedded_instruction"
  | "hidden_text"
  | "low_quality_image"
  | "cropped_content"
  | "metadata_inconsistency"
  | "fake_logo"
  | "forged_signature";

export const DOC_FINDING_LABEL: Record<DocFinding, string> = {
  expired: "Expired",
  appears_expired_but_valid: "Appears expired but is valid",
  vehicle_number_mismatch: "Mismatched vehicle number",
  owner_mismatch: "Mismatched owner",
  date_inconsistency: "Inconsistent dates",
  suspicious_formatting: "Suspicious formatting",
  altered_content: "Detected alteration",
  duplicate_document: "Duplicate document",
  wrong_document_type: "Wrong document type",
  missing_sections: "Missing required sections",
  embedded_instruction: "Embedded instruction to the AI (ignored)",
  hidden_text: "Hidden text detected",
  low_quality_image: "Low-quality image",
  cropped_content: "Cropped — content may be hidden",
  metadata_inconsistency: "Metadata inconsistent with claimed date",
  fake_logo: "Suspected fake government logo",
  forged_signature: "Suspected forged signature",
};

// Static synthetic document as authored in the dataset.
export interface SyntheticDocument {
  id: string;
  filename: string;
  claimedType: DocumentType; // what filename/user implies
  actualType: DocumentType; // ground-truth classification
  groundTruthFields: Record<string, string>;
  groundTruthFindings: DocFinding[];
  requiresHumanValidation: boolean;
  // A short human-readable rendering of the "original" doc for the side-by-side view.
  originalPreview: string;
  // hidden/adversarial payload (e.g. prompt injection) — surfaced but never executed
  embeddedInstruction?: string;
}

// Runtime document attached to an incident (after mock extraction).
export interface IncidentDocument {
  id: string;
  incidentId: string;
  source: SyntheticDocument;
  classification: DocumentType;
  classificationConfidence: number;
  extractedFields: ExtractedField[];
  findings: DocFinding[];
  expiryStatus: "valid" | "expired" | "appears_expired_but_valid" | "unknown";
  requiresHumanValidation: boolean;
  fileHash: string;
  uploadedAt: string;
  uploadedBy: string;
  sourceChannel: Channel;
  deviceMetadata: string;
}

// ── Evidence / chain of custody ──────────────────────────────────────────────

export interface EvidenceRecord {
  id: string;
  incidentId: string;
  label: string;
  provenance: Provenance;
  fileHash: string;
  uploadedAt: string;
  uploadedBy: string;
  sourceChannel: Channel;
  deviceMetadata: string;
  transformationHistory: string[];
  chainOfCustody: { at: string; actor: string; event: string }[];
  fullConversationPreserved: boolean;
  contextMayBeMissing: boolean;
  content: string;
}

// ── Incident understanding (from intake) ─────────────────────────────────────

export interface IncidentUnderstanding {
  detectedLanguage: string;
  detectedLanguageConfidence: number;
  translatedText?: string;
  translationChangedMeaning?: boolean; // ground-truth-driven simulation
  fields: ExtractedField[];
  missingRequiredFields: string[];
  ambiguityWarnings: string[];
  followUpQuestions: string[];
  possibleMultipleIncidents: boolean;
}

// ── Triage output ────────────────────────────────────────────────────────────

export interface TriageResult {
  incidentType: IncidentType;
  incidentTypeConfidence: number;
  subcategory?: string;
  urgency: Urgency;
  immobilized: boolean;
  legalRiskLevel: "low" | "medium" | "high";
  driverSafetyRisk: "low" | "medium" | "high";
  financialRiskPerDay: number;
  missingEvidence: string[];
  contradictions: string[];
  suspectedFraud: boolean;
  fraudSignals: string[];
  confidence: number;
  shouldAbstain: boolean;
  abstainReason?: string;
  requiresHumanEscalation: boolean;
  escalationReason?: string;
}

// ── Action plan ──────────────────────────────────────────────────────────────

export type AbstentionReason =
  | "insufficient_evidence"
  | "conflicting_evidence"
  | "unsupported_jurisdiction"
  | "no_reliable_recommendation"
  | "immediate_lawyer_intervention_required";

export const ABSTENTION_LABEL: Record<AbstentionReason, string> = {
  insufficient_evidence: "Insufficient evidence",
  conflicting_evidence: "Conflicting evidence",
  unsupported_jurisdiction: "Unsupported jurisdiction",
  no_reliable_recommendation: "No reliable recommendation",
  immediate_lawyer_intervention_required: "Immediate lawyer intervention required",
};

export interface ActionStep {
  id: string;
  order: number;
  title: string;
  detail: string;
  sourceIds: string[]; // must be non-empty OR markedUnsupported === true
  confidence: number;
  assumptions: string[];
  markedUnsupported?: boolean;
}

export interface ActionPlan {
  incidentId: string;
  abstained: boolean;
  abstentionReason?: AbstentionReason;
  driverInstructions: string[];
  documentsToCollect: string[];
  legalQuestionsToVerify: string[];
  escalationLevel: "none" | "standard" | "urgent" | "immediate";
  suggestedLawyerSpecialisation?: string;
  steps: ActionStep[];
  sourceIds: string[];
  confidence: number;
  assumptions: string[];
  unresolvedContradictions: string[];
  prohibitedActions: string[];
  requiresHumanApproval: boolean;
  disclaimer: string;
}

// ── Lawyer routing ───────────────────────────────────────────────────────────

export interface RoutingFactor {
  label: string;
  weight: number;
  score: number; // 0..1 contribution before weight
  detail: string;
}

export interface RoutingCandidate {
  lawyerId: string;
  totalScore: number; // 0..1
  factors: RoutingFactor[];
  eligible: boolean;
  ineligibleReasons: string[];
}

export interface RoutingResult {
  candidates: RoutingCandidate[]; // sorted desc
  recommendedLawyerId?: string;
  manualOverrideLawyerId?: string;
}

// ── Lawyer handoff / review ──────────────────────────────────────────────────

export type LawyerDecision =
  | "approved"
  | "edited"
  | "rejected"
  | "requested_more_documents"
  | "reclassified"
  | "urgency_changed"
  | "note_added"
  | "marked_unsupported"
  | "resolution_selected";

export interface LawyerReview {
  id: string;
  incidentId: string;
  lawyerId: string;
  decision: LawyerDecision;
  at: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}

// ── Resolution / feedback ────────────────────────────────────────────────────

export interface Resolution {
  incidentId: string;
  finalIncidentType: IncidentType;
  finalActionTaken: string;
  timeToFirstResponseMin: number;
  timeToLawyerAssignmentMin: number;
  timeToResolutionMin: number;
  vehicleDowntimeMin: number;
  finalPenalty: number;
  avoidedCost: number;
  aiRecommendationAccepted: boolean;
  lawyerCorrections: string[];
  failureCategory?: string;
  userFeedback?: string;
}

// ── Workflow events + audit ──────────────────────────────────────────────────

export interface WorkflowEvent {
  id: string;
  incidentId: string;
  at: string;
  from: WorkflowState;
  to: WorkflowState;
  reason: string;
  actor: string;
  idempotencyKey?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  incidentId: string;
  actor: string;
  actorRole: Role;
  action: string;
  before?: unknown;
  after?: unknown;
  source?: string;
  reason?: string;
  providerVersion?: string;
  confidence?: number;
  requestId: string;
  // integrity chaining
  prevHash: string;
  hash: string;
}

// ── The Incident aggregate ───────────────────────────────────────────────────

export interface Incident {
  id: string;
  caseNumber: string;
  title: string;
  createdAt: string;
  fleetId: string;
  vehicleId?: string;
  driverId?: string;

  channel: Channel;
  originalLanguage: string;
  rawInput: string; // NEVER overwritten
  reportedVehicleNumber?: string;
  reportedLocation?: string;
  jurisdiction?: string;

  state: WorkflowState;
  urgency: Urgency;
  slaState: SlaState;
  slaDueAt: string;

  understanding?: IncidentUnderstanding;
  triage?: TriageResult;
  documents: IncidentDocument[];
  evidence: EvidenceRecord[];
  actionPlan?: ActionPlan;
  routing?: RoutingResult;
  assignedLawyerId?: string;
  reviews: LawyerReview[];
  resolution?: Resolution;

  estimatedDowntimePerDay: number;
  confidence: number;
  suspectedFraud: boolean;

  // Link back to the synthetic ground-truth record for evaluation.
  syntheticId: string;
}

// ── Provider I/O contracts (see lib/providers) ───────────────────────────────

export interface IncidentInput {
  channel: Channel;
  rawInput: string;
  originalLanguage: string;
  syntheticId: string;
}

export interface LegalQuery {
  incidentType: IncidentType;
  jurisdiction?: string;
  keywords: string[];
}

export interface CaseContext {
  incident: Incident;
  understanding?: IncidentUnderstanding;
  triage?: TriageResult;
  documents: IncidentDocument[];
  sources: LegalSource[];
}
