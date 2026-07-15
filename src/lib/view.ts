// Derived view helpers shared across screens.
import type { Incident, Role } from "./types";
import { DRIVERS, FLEETS, LAWYERS, VEHICLES, type AppUser } from "./data/master";
import { can } from "./rbac";
import { NOW } from "./utils";

export function fleetName(id?: string): string {
  return FLEETS.find((f) => f.id === id)?.name ?? "—";
}
export function driverName(id?: string): string {
  return DRIVERS.find((d) => d.id === id)?.name ?? "Unknown";
}
export function vehicleReg(incident: Incident): string {
  const v = VEHICLES.find((x) => x.id === incident.vehicleId);
  return v?.registration ?? incident.reportedVehicleNumber ?? "—";
}
export function vehicleType(id?: string): string {
  return VEHICLES.find((v) => v.id === id)?.vehicleClass ?? "—";
}
export function lawyerName(id?: string): string {
  return LAWYERS.find((l) => l.id === id)?.name ?? "Unassigned";
}

// Tenant isolation: which incidents can this user see?
// Users with fleetId "*" (lawyer, admin, auditor) are cross-fleet service
// providers and see all fleets; everyone else is scoped to their own fleet.
export function visibleIncidents(all: Incident[], user: AppUser): Incident[] {
  if (user.fleetId === "*" || can(user.role as Role, "view_all_fleets")) return all;
  return all.filter((i) => i.fleetId === user.fleetId);
}

export interface DashboardStats {
  activeIncidents: number;
  critical: number;
  immobilized: number;
  downtimeAtRisk: number;
  awaitingDocuments: number;
  awaitingLawyer: number;
  slaBreached: number;
  resolved: number;
  financialImpact: number;
  vehiclesMonitored: number;
  aiAssistedPct: number;
}

const ACTIVE_STATES = new Set([
  "incident_created",
  "intake_processing",
  "awaiting_information",
  "documents_received",
  "document_validation",
  "triage_complete",
  "legal_retrieval",
  "action_plan_generated",
  "human_review_required",
  "lawyer_assigned",
  "in_resolution",
]);

export function dashboardStats(incidents: Incident[]): DashboardStats {
  const active = incidents.filter((i) => ACTIVE_STATES.has(i.state));
  const resolved = incidents.filter((i) => i.state === "resolved" || i.state === "closed");
  const downtimeAtRisk = active.reduce((sum, i) => sum + i.estimatedDowntimePerDay, 0);
  const financialImpact = incidents.reduce(
    (sum, i) => sum + (i.resolution ? i.resolution.finalPenalty : i.estimatedDowntimePerDay),
    0,
  );
  const aiAssisted = incidents.filter((i) => i.triage && !i.triage.shouldAbstain).length;
  return {
    activeIncidents: active.length,
    critical: active.filter((i) => i.urgency === "critical").length,
    immobilized: active.filter((i) => i.triage?.immobilized).length,
    downtimeAtRisk,
    awaitingDocuments: incidents.filter((i) => i.state === "awaiting_information").length,
    awaitingLawyer: incidents.filter((i) => i.state === "human_review_required").length,
    slaBreached: active.filter((i) => i.slaState === "breached").length,
    resolved: resolved.length,
    financialImpact,
    vehiclesMonitored: FLEETS.reduce((s, f) => s + f.vehicleCount, 0),
    aiAssistedPct: incidents.length ? Math.round((aiAssisted / incidents.length) * 100) : 0,
  };
}

export function slaCountdown(incident: Incident): string {
  const due = new Date(incident.slaDueAt).getTime();
  const diff = due - NOW.getTime();
  if (incident.state === "resolved" || incident.state === "closed") return "—";
  const mins = Math.round(diff / 60000);
  if (mins < 0) return `−${formatMins(-mins)}`;
  return formatMins(mins);
}
function formatMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
