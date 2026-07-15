// ─────────────────────────────────────────────────────────────────────────────
// Dataset builder helpers.
//
// `defineIncident` takes a concise scenario definition and fills defaults to
// produce a fully-typed SyntheticIncident. Timestamps and SLA are assigned
// deterministically in incidents.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Channel, DocFinding, DocumentType, IncidentType, Urgency } from "../types";
import type { Difficulty, SyntheticDocumentSpec, SyntheticIncident } from "../synthetic/schema";
import type { DatasetTag } from "../synthetic/schema";

let docCounter = 0;

export function doc(spec: {
  filename: string;
  claimedType: DocumentType;
  actualType?: DocumentType;
  fields?: Record<string, string>;
  findings?: DocFinding[];
  requiresHumanValidation?: boolean;
  preview?: string;
  embeddedInstruction?: string;
}): SyntheticDocumentSpec {
  docCounter += 1;
  const actualType = spec.actualType ?? spec.claimedType;
  return {
    id: `docspec-${docCounter}`,
    filename: spec.filename,
    claimedType: spec.claimedType,
    actualType,
    fields: spec.fields ?? {},
    findings: spec.findings ?? [],
    requiresHumanValidation:
      spec.requiresHumanValidation ?? (spec.findings ?? []).length > 0,
    originalPreview:
      spec.preview ?? `[Synthetic ${actualType.toUpperCase()} — ${spec.filename}]`,
    embeddedInstruction: spec.embeddedInstruction,
  };
}

export interface ScenarioDef {
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
  estimatedDowntimePerDay?: number;
  documents?: SyntheticDocumentSpec[];

  // ground truth
  incidentType: IncidentType;
  urgency: Urgency;
  immobilized?: boolean;
  suspectedFraud?: boolean;
  requiresHumanEscalation?: boolean;
  shouldAbstain?: boolean;
  requiredDocuments?: string[];
  contradictions?: string[];
  warnings?: string[];
  recommendedLawyerSpecialisation?: string;

  // simulated system output (defaults to matching ground truth = correct case)
  sys?: {
    incidentType?: IncidentType;
    urgency?: Urgency;
    confidence?: number;
    extractedFields?: Record<string, unknown>;
    contradictions?: string[];
    suspectedFraud?: boolean;
    requiresHumanEscalation?: boolean;
    shouldAbstain?: boolean;
    recommendedActions?: string[];
    sourceIds?: string[];
  };

  difficulty: Difficulty;
  tags: DatasetTag[];
  expectedFailureModes?: string[];
}

function defaultActions(type: IncidentType): string[] {
  const map: Partial<Record<IncidentType, string[]>> = {
    permit_issue: [
      "Verify permit scope against the current route and state authorization.",
      "Compare the notice's cited provision against permit particulars.",
      "Assemble response pack: RC, permit, insurance, notice, GPS route.",
      "Escalate to a local mobility lawyer with the full case brief.",
    ],
    vehicle_detention: [
      "Confirm the statutory basis stated for the detention.",
      "Collect the seizure/detention notice and vehicle documents.",
      "Prepare a release request pack and escalate to counsel.",
    ],
    accident: [
      "Confirm driver and third-party safety; record injuries if any.",
      "Preserve accident photographs and the scene record as electronic records.",
      "Notify insurer and route to accident-claims counsel.",
    ],
    traffic_challan: [
      "Confirm the challan reason and cited section.",
      "Check whether the challan is disputable via virtual court.",
      "Assemble supporting documents and route to challan counsel.",
    ],
    bribery_demand: [
      "Advise the driver not to pay any unofficial amount.",
      "Safely document the demand without escalation risk to the driver.",
      "Route to anti-corruption counsel for lawful escalation options.",
    ],
    tax_border_issue: [
      "Verify e-way bill and state entry tax status.",
      "Collect border check-post documentation.",
      "Route to border/tax counsel in the relevant state.",
    ],
    cargo_issue: [
      "Match cargo category against permit authorization.",
      "Collect the goods documentation and permit.",
      "Route to cargo/permit counsel.",
    ],
    court_issue: [
      "Confirm court, matter, and hearing date.",
      "Assemble the case file and prior correspondence.",
      "Route to court-matters counsel.",
    ],
  };
  return map[type] ?? [
    "Collect the primary notice/document and vehicle papers.",
    "Verify the stated basis of the action.",
    "Route to an appropriate mobility lawyer with the case brief.",
  ];
}

function defaultSources(type: IncidentType): string[] {
  const map: Partial<Record<IncidentType, string[]>> = {
    permit_issue: ["SRC-MVA-PERMIT", "SRC-RJ-PERMIT-RULES"],
    vehicle_detention: ["SRC-MVA-DETENTION", "SRC-SAFETY-ESCALATION"],
    accident: ["SRC-MH-ACCIDENT", "SRC-EVIDENCE-HANDLING"],
    traffic_challan: ["SRC-CHALLAN-DISPUTE", "SRC-PUC-INSURANCE"],
    bribery_demand: ["SRC-ANTI-BRIBERY", "SRC-SAFETY-ESCALATION"],
    tax_border_issue: ["SRC-BORDER-TAX", "SRC-KA-BORDER"],
    cargo_issue: ["SRC-CARGO-CLASS", "SRC-BORDER-TAX"],
    court_issue: ["SRC-COURT-PROC", "SRC-CHALLAN-DISPUTE"],
    driver_document_issue: ["SRC-DL-ENDORSEMENT"],
    vehicle_document_issue: ["SRC-PUC-INSURANCE", "SRC-RC-OWNERSHIP"],
    disputed_vehicle_identity: ["SRC-RC-OWNERSHIP", "SRC-FRAUD-FORGERY"],
    possible_fraud: ["SRC-FRAUD-FORGERY", "SRC-RC-OWNERSHIP"],
    police_interaction: ["SRC-SAFETY-ESCALATION", "SRC-MVA-DETENTION"],
    unknown_unsupported: ["SRC-UNSUPPORTED"],
  };
  return map[type] ?? ["SRC-EVIDENCE-HANDLING"];
}

export function defineIncident(def: ScenarioDef): SyntheticIncident {
  const immobilized = def.immobilized ?? ["vehicle_detention", "permit_issue"].includes(def.incidentType);
  const shouldAbstain = def.shouldAbstain ?? false;
  const sysType = def.sys?.incidentType ?? def.incidentType;
  const sysUrgency = def.sys?.urgency ?? def.urgency;
  const sysContradictions = def.sys?.contradictions ?? def.contradictions ?? [];
  const sysActions = shouldAbstain
    ? []
    : def.sys?.recommendedActions ?? defaultActions(sysType);
  const sysSources = shouldAbstain ? [] : def.sys?.sourceIds ?? defaultSources(sysType);

  return {
    id: def.id,
    title: def.title,
    description: def.description,
    channel: def.channel,
    originalLanguage: def.originalLanguage,
    rawInput: def.rawInput,
    fleetId: def.fleetId,
    vehicleId: def.vehicleId,
    driverId: def.driverId,
    reportedVehicleNumber: def.reportedVehicleNumber,
    actualVehicleNumber: def.actualVehicleNumber,
    reportedLocation: def.reportedLocation,
    actualLocation: def.actualLocation,
    jurisdiction: def.jurisdiction,
    createdAt: "", // assigned in incidents.ts
    estimatedDowntimePerDay: def.estimatedDowntimePerDay ?? 0,
    documents: def.documents ?? [],
    expected: {
      incidentType: def.incidentType,
      urgency: def.urgency,
      immobilized,
      suspectedFraud: def.suspectedFraud ?? false,
      requiresHumanEscalation: def.requiresHumanEscalation ?? (def.urgency === "critical"),
      shouldAbstain,
      requiredDocuments: def.requiredDocuments ?? [],
      contradictions: def.contradictions ?? [],
      warnings: def.warnings ?? [],
      recommendedLawyerSpecialisation: def.recommendedLawyerSpecialisation,
    },
    simulatedSystemOutput: {
      incidentType: sysType,
      urgency: sysUrgency,
      confidence: def.sys?.confidence ?? (shouldAbstain ? 0.42 : 0.9),
      extractedFields: def.sys?.extractedFields ?? {},
      contradictions: sysContradictions,
      suspectedFraud: def.sys?.suspectedFraud ?? def.suspectedFraud ?? false,
      requiresHumanEscalation:
        def.sys?.requiresHumanEscalation ?? def.requiresHumanEscalation ?? (def.urgency === "critical"),
      shouldAbstain: def.sys?.shouldAbstain ?? shouldAbstain,
      recommendedActions: sysActions,
      sourceIds: sysSources,
      recommendedLawyerSpecialisation: def.recommendedLawyerSpecialisation,
    },
    evaluation: {
      expectedFailureModes: def.expectedFailureModes ?? [],
      difficulty: def.difficulty,
      tags: def.tags,
    },
  };
}
