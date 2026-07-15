import { NextResponse } from "next/server";
import { SYNTHETIC_INCIDENTS } from "@/lib/data/incidents";
import { hydrateIncident } from "@/lib/data/hydrate";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";

// GET /api/incidents — incident summaries (server-computed from the seeded world).
// NOTE: read-only. Mutations happen in the client store in this prototype; in
// production these would be POST/PATCH route handlers backed by Postgres.
export function GET() {
  const rows = SYNTHETIC_INCIDENTS.map((s) => {
    const { incident } = hydrateIncident(s);
    return {
      id: incident.id,
      caseNumber: incident.caseNumber,
      title: incident.title,
      fleetId: incident.fleetId,
      vehicle: incident.reportedVehicleNumber,
      jurisdiction: incident.jurisdiction,
      incidentType: incident.triage?.incidentType,
      incidentTypeLabel: incident.triage ? INCIDENT_TYPE_LABEL[incident.triage.incidentType] : undefined,
      urgency: incident.urgency,
      state: incident.state,
      confidence: incident.confidence,
      suspectedFraud: incident.suspectedFraud,
      slaState: incident.slaState,
      estimatedDowntimePerDay: incident.estimatedDowntimePerDay,
      createdAt: incident.createdAt,
    };
  });
  return NextResponse.json({ count: rows.length, incidents: rows });
}
