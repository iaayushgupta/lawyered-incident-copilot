import type { WorkflowState } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Incident workflow state machine.
//
// Transitions are validated against ALLOWED. Invalid transitions are rejected.
// Idempotency is handled by the caller (store) via idempotency keys; duplicate
// and out-of-order events are surfaced rather than silently applied.
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED: Record<WorkflowState, WorkflowState[]> = {
  incident_created: ["intake_processing", "failed"],
  intake_processing: ["awaiting_information", "documents_received", "triage_complete", "abstained", "failed"],
  awaiting_information: ["documents_received", "abstained", "failed"],
  documents_received: ["document_validation", "failed"],
  document_validation: ["triage_complete", "awaiting_information", "abstained", "failed"],
  triage_complete: ["legal_retrieval", "human_review_required", "abstained", "failed"],
  legal_retrieval: ["action_plan_generated", "abstained", "failed"],
  action_plan_generated: ["human_review_required", "abstained", "failed"],
  human_review_required: ["lawyer_assigned", "awaiting_information", "abstained", "failed"],
  lawyer_assigned: ["in_resolution", "human_review_required", "failed"],
  in_resolution: ["resolved", "human_review_required", "failed"],
  resolved: ["closed"],
  closed: [],
  abstained: ["human_review_required", "closed"],
  failed: ["intake_processing", "closed"], // allow retry/recovery
};

// Terminal states.
export const TERMINAL: WorkflowState[] = ["closed"];

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(public from: WorkflowState, public to: WorkflowState) {
    super(`Invalid transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

// The "happy path" ordering used to progress a case one step at a time in the
// interactive workflow runner.
export const HAPPY_PATH: WorkflowState[] = [
  "incident_created",
  "intake_processing",
  "documents_received",
  "document_validation",
  "triage_complete",
  "legal_retrieval",
  "action_plan_generated",
  "human_review_required",
  "lawyer_assigned",
  "in_resolution",
  "resolved",
  "closed",
];

export function isBefore(a: WorkflowState, b: WorkflowState): boolean {
  return HAPPY_PATH.indexOf(a) < HAPPY_PATH.indexOf(b);
}
