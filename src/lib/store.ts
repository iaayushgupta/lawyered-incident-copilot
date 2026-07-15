"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Client-side world store (Zustand).
//
// The entire synthetic world is hydrated in-memory once. All interactive
// mutations (lawyer decisions, routing overrides, resolution, workflow stepping,
// fault toggles, role switching) update this store and append to append-only
// audit logs + workflow events. No backend/DB is required to run the prototype.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type {
  AuditEntry,
  Incident,
  IncidentType,
  LawyerDecision,
  Role,
  Urgency,
  WorkflowEvent,
  WorkflowState,
} from "./types";
import { SYNTHETIC_INCIDENTS } from "./data/incidents";
import { hydrateIncident } from "./data/hydrate";
import { FLEETS, DRIVERS, VEHICLES, LAWYERS, USERS, type AppUser } from "./data/master";
import { LEGAL_SOURCES } from "./data/sources";
import { appendAudit } from "./audit";
import { canTransition } from "./workflow/machine";
import { routeIncident } from "./workflow/routing";
import { NOW } from "./utils";
import type { FaultId } from "./providers/faults";

interface World {
  incidents: Record<string, Incident>;
  order: string[];
  events: Record<string, WorkflowEvent[]>;
  audit: Record<string, AuditEntry[]>;
}

function buildWorld(): World {
  const incidents: Record<string, Incident> = {};
  const events: Record<string, WorkflowEvent[]> = {};
  const audit: Record<string, AuditEntry[]> = {};
  const order: string[] = [];
  // Sort by createdAt desc for a natural dashboard ordering.
  const sorted = [...SYNTHETIC_INCIDENTS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const s of sorted) {
    const { incident, events: evs, audit: aud } = hydrateIncident(s);
    incidents[incident.id] = incident;
    events[incident.id] = evs;
    audit[incident.id] = aud;
    order.push(incident.id);
  }
  return { incidents, order, events, audit };
}

let clock = NOW.getTime() + 60000;
function tick(): string {
  clock += 45000;
  return new Date(clock).toISOString();
}

export interface Toast {
  id: number;
  kind: "info" | "success" | "warn" | "error";
  message: string;
}

interface StoreState {
  world: World;
  currentUserId: string;
  faults: Set<FaultId>;
  toasts: Toast[];
  auditTampered: boolean;

  // selectors
  currentUser: () => AppUser;
  // mutations
  setUser: (id: string) => void;
  toggleFault: (f: FaultId) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;

  transition: (id: string, to: WorkflowState, reason: string, actor: string) => boolean;
  lawyerDecision: (id: string, decision: LawyerDecision, note?: string, patch?: Partial<Incident>) => void;
  assignLawyer: (id: string, lawyerId: string, manual: boolean) => void;
  reclassify: (id: string, type: IncidentType) => void;
  changeUrgency: (id: string, urgency: Urgency) => void;
  markStepUnsupported: (id: string, stepId: string) => void;
  verifyField: (id: string, docId: string, fieldKey: string) => void;
  resolveIncident: (id: string, accepted: boolean, note?: string) => void;
  advance: (id: string) => void;
  resetIncident: (id: string) => void;
  tamperAudit: () => void;
}

function actorRoleOf(user: AppUser): Role {
  return user.role;
}

// Next state in the happy path from a given state (for `advance`).
const NEXT: Partial<Record<WorkflowState, WorkflowState>> = {
  incident_created: "intake_processing",
  intake_processing: "documents_received",
  documents_received: "document_validation",
  document_validation: "triage_complete",
  triage_complete: "legal_retrieval",
  legal_retrieval: "action_plan_generated",
  action_plan_generated: "human_review_required",
  human_review_required: "lawyer_assigned",
  lawyer_assigned: "in_resolution",
  in_resolution: "resolved",
  resolved: "closed",
};

let toastId = 0;

export const useStore = create<StoreState>((set, get) => ({
  world: buildWorld(),
  currentUserId: "usr-legalops-1",
  faults: new Set<FaultId>(),
  toasts: [],
  auditTampered: false,

  currentUser: () => USERS.find((u) => u.id === get().currentUserId) ?? USERS[0],

  setUser: (id) => {
    set({ currentUserId: id });
    const u = USERS.find((x) => x.id === id);
    if (u) get().pushToast("info", `Viewing as ${u.name}`);
  },

  toggleFault: (f) =>
    set((st) => {
      const next = new Set(st.faults);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return { faults: next };
    }),

  pushToast: (kind, message) =>
    set((st) => ({ toasts: [...st.toasts, { id: ++toastId, kind, message }] })),
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  transition: (id, to, reason, actor) => {
    const st = get();
    const inc = st.world.incidents[id];
    if (!inc) return false;
    if (!canTransition(inc.state, to)) {
      st.pushToast("error", `Invalid transition ${inc.state} → ${to} rejected by state machine.`);
      return false;
    }
    const at = tick();
    const evt: WorkflowEvent = {
      id: `evt-${id}-${(st.world.events[id]?.length ?? 0) + 1}`,
      incidentId: id,
      at,
      from: inc.state,
      to,
      reason,
      actor,
    };
    set((s) => ({
      world: {
        ...s.world,
        incidents: { ...s.world.incidents, [id]: { ...inc, state: to } },
        events: { ...s.world.events, [id]: [...(s.world.events[id] ?? []), evt] },
      },
    }));
    return true;
  },

  lawyerDecision: (id, decision, note, patch) => {
    const st = get();
    const user = st.currentUser();
    const inc = st.world.incidents[id];
    if (!inc) return;
    const at = tick();
    const review = {
      id: `rev-${id}-${inc.reviews.length + 1}`,
      incidentId: id,
      lawyerId: user.lawyerId ?? "law-1",
      decision,
      at,
      note,
    };
    const log = [...(st.world.audit[id] ?? [])];
    appendAudit(log, {
      incidentId: id,
      actor: user.name,
      actorRole: actorRoleOf(user),
      action: `lawyer_${decision}`,
      reason: note,
      before: patch ? pick(inc, patch) : undefined,
      after: patch,
      source: user.lawyerId,
    }, at);
    set((s) => ({
      world: {
        ...s.world,
        incidents: { ...s.world.incidents, [id]: { ...inc, ...patch, reviews: [...inc.reviews, review] } },
        audit: { ...s.world.audit, [id]: log },
      },
    }));
  },

  assignLawyer: (id, lawyerId, manual) => {
    const st = get();
    const user = st.currentUser();
    const inc = st.world.incidents[id];
    if (!inc) return;
    const routing = inc.routing ?? routeIncident(inc, LAWYERS);
    const at = tick();
    const log = [...(st.world.audit[id] ?? [])];
    appendAudit(log, {
      incidentId: id,
      actor: user.name,
      actorRole: actorRoleOf(user),
      action: manual ? "lawyer_assigned_manual_override" : "lawyer_assigned",
      before: { assignedLawyerId: inc.assignedLawyerId },
      after: { assignedLawyerId: lawyerId },
      reason: manual ? "Manual override of routing recommendation" : "Accepted routing recommendation",
    }, at);
    set((s) => ({
      world: {
        ...s.world,
        incidents: {
          ...s.world.incidents,
          [id]: {
            ...inc,
            assignedLawyerId: lawyerId,
            routing: { ...routing, manualOverrideLawyerId: manual ? lawyerId : undefined },
          },
        },
        audit: { ...s.world.audit, [id]: log },
      },
    }));
    if (inc.state === "human_review_required" || inc.state === "action_plan_generated") {
      get().transition(id, "lawyer_assigned", "Lawyer assigned via routing.", user.name);
    }
    get().pushToast("success", `Assigned to ${LAWYERS.find((l) => l.id === lawyerId)?.name}`);
  },

  reclassify: (id, type) => {
    const st = get();
    const inc = st.world.incidents[id];
    if (!inc || !inc.triage) return;
    st.lawyerDecision(id, "reclassified", `Reclassified to ${type}`, {
      triage: { ...inc.triage, incidentType: type },
    });
    st.pushToast("info", "Incident reclassified by lawyer.");
  },

  changeUrgency: (id, urgency) => {
    const st = get();
    const inc = st.world.incidents[id];
    if (!inc) return;
    st.lawyerDecision(id, "urgency_changed", `Urgency changed to ${urgency}`, { urgency });
    st.pushToast("info", "Urgency updated by lawyer.");
  },

  markStepUnsupported: (id, stepId) => {
    const st = get();
    const inc = st.world.incidents[id];
    if (!inc?.actionPlan) return;
    const steps = inc.actionPlan.steps.map((s) => (s.id === stepId ? { ...s, markedUnsupported: true } : s));
    st.lawyerDecision(id, "marked_unsupported", `Marked step ${stepId} as unsupported`, {
      actionPlan: { ...inc.actionPlan, steps },
    });
    st.pushToast("warn", "AI statement marked unsupported.");
  },

  verifyField: (id, docId, fieldKey) => {
    const st = get();
    const user = st.currentUser();
    const inc = st.world.incidents[id];
    if (!inc) return;
    const documents = inc.documents.map((d) =>
      d.id === docId
        ? {
            ...d,
            extractedFields: d.extractedFields.map((f) =>
              f.key === fieldKey ? { ...f, reviewStatus: "verified" as const, provenance: "lawyer_reviewed" as const } : f,
            ),
          }
        : d,
    );
    const at = tick();
    const log = [...(st.world.audit[id] ?? [])];
    appendAudit(log, {
      incidentId: id,
      actor: user.name,
      actorRole: actorRoleOf(user),
      action: "verification_status_changed",
      after: { docId, fieldKey, reviewStatus: "verified" },
      reason: "Human validation of extracted field",
    }, at);
    set((s) => ({
      world: {
        ...s.world,
        incidents: { ...s.world.incidents, [id]: { ...inc, documents } },
        audit: { ...s.world.audit, [id]: log },
      },
    }));
    st.pushToast("success", "Field marked verified (human-validated).");
  },

  resolveIncident: (id, accepted, note) => {
    const st = get();
    const user = st.currentUser();
    const inc = st.world.incidents[id];
    if (!inc) return;
    const at = tick();
    const created = new Date(inc.createdAt).getTime();
    const ttrMin = Math.round((clock - created) / 60000);
    const resolution = {
      incidentId: id,
      finalIncidentType: inc.triage?.incidentType ?? "unknown_unsupported",
      finalActionTaken: note ?? (accepted ? "Resolved per approved plan." : "Resolved after correction."),
      timeToFirstResponseMin: 4,
      timeToLawyerAssignmentMin: 12,
      timeToResolutionMin: ttrMin,
      vehicleDowntimeMin: ttrMin + 20,
      finalPenalty: Math.round(inc.estimatedDowntimePerDay * 0.1),
      avoidedCost: Math.round(inc.estimatedDowntimePerDay * 0.4),
      aiRecommendationAccepted: accepted,
      lawyerCorrections: accepted ? [] : ["Lawyer adjusted the plan."],
      userFeedback: undefined,
    } as Incident["resolution"];
    const log = [...(st.world.audit[id] ?? [])];
    appendAudit(log, {
      incidentId: id,
      actor: user.name,
      actorRole: actorRoleOf(user),
      action: "resolution_selected",
      after: { accepted },
      reason: note,
    }, at);
    set((s) => ({
      world: {
        ...s.world,
        incidents: { ...s.world.incidents, [id]: { ...inc, resolution } },
        audit: { ...s.world.audit, [id]: log },
      },
    }));
    if (inc.state !== "resolved" && inc.state !== "closed") {
      get().transition(id, inc.state === "in_resolution" ? "resolved" : "in_resolution", "Resolution captured.", user.name);
      if (get().world.incidents[id].state === "in_resolution") get().transition(id, "resolved", "Resolution captured.", user.name);
    }
    st.pushToast("success", "Resolution captured; outcome feeds evaluation.");
  },

  advance: (id) => {
    const st = get();
    const inc = st.world.incidents[id];
    if (!inc) return;
    const next = NEXT[inc.state];
    if (!next) {
      st.pushToast("info", "No further automatic step from this state.");
      return;
    }
    // High-risk gate: never auto-advance past human review without a lawyer.
    if (inc.state === "human_review_required" && !inc.assignedLawyerId) {
      st.pushToast("warn", "Human review required — assign a lawyer to proceed.");
      return;
    }
    st.transition(id, next, `Advanced to ${next}.`, "system");
  },

  resetIncident: (id) => {
    const s = SYNTHETIC_INCIDENTS.find((x) => x.id === id);
    if (!s) return;
    const { incident, events, audit } = hydrateIncident(s);
    set((state) => ({
      world: {
        ...state.world,
        incidents: { ...state.world.incidents, [id]: incident },
        events: { ...state.world.events, [id]: events },
        audit: { ...state.world.audit, [id]: audit },
      },
    }));
    get().pushToast("info", "Incident reset to seeded state.");
  },

  tamperAudit: () =>
    set((s) => ({ auditTampered: !s.auditTampered })),
}));

function pick(inc: Incident, patch: Partial<Incident>): Partial<Incident> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) out[k] = (inc as unknown as Record<string, unknown>)[k];
  return out as Partial<Incident>;
}

// Re-export master data for convenience in components.
export { FLEETS, DRIVERS, VEHICLES, LAWYERS, USERS, LEGAL_SOURCES };
