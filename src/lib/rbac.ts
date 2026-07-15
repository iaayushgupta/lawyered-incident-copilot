import type { Role } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control (prototype).
//
// This is intentionally a pure permission matrix rather than real auth. It is
// exercised by the in-app Role Switcher and enforced in the UI + a few guarded
// actions so permission differences are demonstrable and testable.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  | "view_all_fleets" // cross-tenant visibility
  | "view_dashboard"
  | "view_incident"
  | "run_workflow"
  | "upload_document"
  | "approve_action_plan" // high-risk gate — lawyers/admin only
  | "reject_action_plan"
  | "edit_action_plan"
  | "reclassify_incident"
  | "assign_lawyer"
  | "override_routing"
  | "resolve_incident"
  | "view_evaluation"
  | "view_audit"
  | "export_data"
  | "toggle_faults" // observability / error-injection controls
  | "view_pii";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  driver: ["view_incident", "upload_document"],
  fleet_operator: [
    "view_dashboard",
    "view_incident",
    "run_workflow",
    "upload_document",
    "assign_lawyer",
  ],
  legal_ops: [
    "view_dashboard",
    "view_incident",
    "run_workflow",
    "upload_document",
    "reclassify_incident",
    "assign_lawyer",
    "override_routing",
    "view_evaluation",
    "view_audit",
    "view_pii",
    "toggle_faults",
  ],
  lawyer: [
    "view_dashboard",
    "view_incident",
    "approve_action_plan",
    "reject_action_plan",
    "edit_action_plan",
    "reclassify_incident",
    "assign_lawyer",
    "override_routing",
    "resolve_incident",
    "view_pii",
  ],
  admin: [
    "view_all_fleets",
    "view_dashboard",
    "view_incident",
    "run_workflow",
    "upload_document",
    "approve_action_plan",
    "reject_action_plan",
    "edit_action_plan",
    "reclassify_incident",
    "assign_lawyer",
    "override_routing",
    "resolve_incident",
    "view_evaluation",
    "view_audit",
    "export_data",
    "toggle_faults",
    "view_pii",
  ],
  auditor: [
    "view_all_fleets",
    "view_dashboard",
    "view_incident",
    "view_evaluation",
    "view_audit",
    "export_data",
    "view_pii",
  ],
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}

// Which fleet(s) can this role+identity see? Admin/auditor see all; everyone
// else is scoped to their own fleet (tenant isolation).
export function visibleFleets(role: Role, ownFleetId: string, allFleetIds: string[]): string[] {
  if (can(role, "view_all_fleets")) return allFleetIds;
  return [ownFleetId];
}
