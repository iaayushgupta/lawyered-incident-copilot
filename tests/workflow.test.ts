import { describe, it, expect } from "vitest";
import { canTransition, ALLOWED, InvalidTransitionError } from "@/lib/workflow/machine";
import { runTriage, requiresApprovalGate } from "@/lib/workflow/triage";
import { getSyntheticById } from "@/lib/data/incidents";
import { hydrateUnderstanding, hydrateDocuments } from "@/lib/data/hydrate";

describe("workflow state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("incident_created", "intake_processing")).toBe(true);
    expect(canTransition("triage_complete", "legal_retrieval")).toBe(true);
    expect(canTransition("action_plan_generated", "human_review_required")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("incident_created", "resolved")).toBe(false);
    expect(canTransition("closed", "intake_processing")).toBe(false);
    expect(canTransition("resolved", "intake_processing")).toBe(false);
  });

  it("has terminal closed state with no outgoing transitions", () => {
    expect(ALLOWED.closed).toEqual([]);
  });

  it("supports abstain and failed recovery paths", () => {
    expect(canTransition("triage_complete", "abstained")).toBe(true);
    expect(canTransition("failed", "intake_processing")).toBe(true);
  });

  it("InvalidTransitionError carries states", () => {
    const e = new InvalidTransitionError("closed", "resolved");
    expect(e.from).toBe("closed");
    expect(e.to).toBe("resolved");
  });
});

describe("triage engine", () => {
  it("produces classification + urgency matching the flagship permit case", () => {
    const s = getSyntheticById("SIG-A-01")!;
    const u = hydrateUnderstanding(s);
    const docs = hydrateDocuments(s);
    const t = runTriage(s, u, docs);
    expect(t.incidentType).toBe("permit_issue");
    expect(t.urgency).toBe("critical");
    expect(t.immobilized).toBe(true);
  });

  it("surfaces fraud signals from document findings", () => {
    const s = getSyntheticById("SIG-A-07")!; // fabricated notice
    const u = hydrateUnderstanding(s);
    const docs = hydrateDocuments(s);
    const t = runTriage(s, u, docs);
    expect(t.suspectedFraud).toBe(true);
  });

  it("approval gate triggers on high risk / low confidence", () => {
    const critical = { urgency: "critical", suspectedFraud: false, contradictions: [], requiresHumanEscalation: true, confidence: 0.95 } as never;
    expect(requiresApprovalGate(critical)).toBe(true);
    const lowConf = { urgency: "low", suspectedFraud: false, contradictions: [], requiresHumanEscalation: false, confidence: 0.5 } as never;
    expect(requiresApprovalGate(lowConf)).toBe(true);
    const clean = { urgency: "low", suspectedFraud: false, contradictions: [], requiresHumanEscalation: false, confidence: 0.9 } as never;
    expect(requiresApprovalGate(clean)).toBe(false);
  });
});
