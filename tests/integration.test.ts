import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "@/lib/store";
import { verifyChain } from "@/lib/audit";
import { can, visibleFleets } from "@/lib/rbac";
import { visibleIncidents } from "@/lib/view";
import { USERS, FLEETS } from "@/lib/data/master";

// Zustand store is usable outside React via getState().
function store() {
  return useStore.getState();
}

describe("store integration — incident lifecycle", () => {
  beforeEach(() => {
    // reset a known incident to a clean seeded state before each test
    store().resetIncident("SIG-A-01");
  });

  it("rejects invalid workflow transitions", () => {
    const ok = store().transition("SIG-A-01", "resolved", "illegal jump", "system");
    expect(ok).toBe(false); // cannot jump straight to resolved from a mid state
  });

  it("records a lawyer approval as a review + audit entry", () => {
    store().setUser("usr-lawyer-1");
    const before = store().world.audit["SIG-A-01"].length;
    store().lawyerDecision("SIG-A-01", "approved", "Looks correct.");
    const inc = store().world.incidents["SIG-A-01"];
    expect(inc.reviews.at(-1)?.decision).toBe("approved");
    expect(store().world.audit["SIG-A-01"].length).toBe(before + 1);
  });

  it("assigns a lawyer and logs a manual override", () => {
    store().setUser("usr-admin-1");
    store().assignLawyer("SIG-A-01", "law-9", true);
    const inc = store().world.incidents["SIG-A-01"];
    expect(inc.assignedLawyerId).toBe("law-9");
    const actions = store().world.audit["SIG-A-01"].map((a) => a.action);
    expect(actions).toContain("lawyer_assigned_manual_override");
  });

  it("captures a resolution and marks the incident resolved", () => {
    store().setUser("usr-lawyer-1");
    store().resolveIncident("SIG-A-01", true, "Released after verification.");
    const inc = store().world.incidents["SIG-A-01"];
    expect(inc.resolution).toBeTruthy();
    expect(inc.resolution?.aiRecommendationAccepted).toBe(true);
  });

  it("verification of an extracted field is an explicit, audited human action", () => {
    store().setUser("usr-lawyer-1");
    const doc = store().world.incidents["SIG-A-01"].documents[0];
    if (doc && doc.extractedFields[0]) {
      const key = doc.extractedFields[0].key;
      store().verifyField("SIG-A-01", doc.id, key);
      const updated = store().world.incidents["SIG-A-01"].documents.find((d) => d.id === doc.id)!;
      const f = updated.extractedFields.find((x) => x.key === key)!;
      expect(f.reviewStatus).toBe("verified");
      expect(f.provenance).toBe("lawyer_reviewed");
      expect(store().world.audit["SIG-A-01"].some((a) => a.action === "verification_status_changed")).toBe(true);
    }
  });

  it("keeps every incident audit chain intact (hash-chained, append-only)", () => {
    let checked = 0;
    for (const id of store().world.order) {
      const chain = store().world.audit[id];
      if (chain.length) {
        expect(verifyChain(chain)).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe("RBAC + tenant isolation", () => {
  const all = () => useStore.getState().world.order.map((id) => useStore.getState().world.incidents[id]);

  it("only lawyer/admin can approve high-risk action plans", () => {
    expect(can("lawyer", "approve_action_plan")).toBe(true);
    expect(can("admin", "approve_action_plan")).toBe(true);
    expect(can("legal_ops", "approve_action_plan")).toBe(false);
    expect(can("fleet_operator", "approve_action_plan")).toBe(false);
    expect(can("driver", "approve_action_plan")).toBe(false);
  });

  it("scopes fleet operators to their own fleet", () => {
    const op = USERS.find((u) => u.id === "usr-fleet-1")!; // NorthStar
    const scoped = visibleIncidents(all(), op);
    expect(scoped.every((i) => i.fleetId === op.fleetId)).toBe(true);
    expect(scoped.length).toBeLessThan(all().length);
  });

  it("gives cross-fleet roles (lawyer/admin/auditor) full visibility", () => {
    const lawyer = USERS.find((u) => u.id === "usr-lawyer-1")!;
    const auditor = USERS.find((u) => u.id === "usr-auditor-1")!;
    expect(visibleIncidents(all(), lawyer).length).toBe(all().length);
    expect(visibleIncidents(all(), auditor).length).toBe(all().length);
  });

  it("visibleFleets respects the view_all_fleets permission", () => {
    const allIds = FLEETS.map((f) => f.id);
    expect(visibleFleets("admin", "flt-northstar", allIds)).toEqual(allIds);
    expect(visibleFleets("fleet_operator", "flt-northstar", allIds)).toEqual(["flt-northstar"]);
  });
});
