// ─────────────────────────────────────────────────────────────────────────────
// Programmatic incident generator.
//
// Produces routine + moderately-varied incidents to complement the hand-authored
// signature scenarios and push the dataset past 100. Variety comes from composing
// building blocks (incident type, state, vehicle, channel, language, and an
// adversarial modifier) — NOT from cloning one template with new names. Every
// generated case still carries genuine, distinct ground truth.
// ─────────────────────────────────────────────────────────────────────────────

import type { Channel, DocFinding, DocumentType, IncidentType, Urgency } from "../types";
import type { DatasetTag, SyntheticIncident } from "../synthetic/schema";
import { defineIncident, doc } from "./build";
import { DRIVERS, VEHICLES } from "./master";
import { mulberry32, seedFrom } from "../utils";

interface TypeBlock {
  type: IncidentType;
  urgency: Urgency;
  baseDowntime: number;
  requiredDocuments: string[];
  primaryDoc: { claimed: DocumentType; fields: (reg: string) => Record<string, string> };
  spec?: string;
  templates: string[]; // raw-input templates, {loc} placeholder
}

const STATES: { name: string; loc: string }[] = [
  { name: "Rajasthan", loc: "Ajmer bypass, Rajasthan" },
  { name: "Maharashtra", loc: "Pune-Solapur highway, Maharashtra" },
  { name: "Karnataka", loc: "Hubli check-post, Karnataka" },
  { name: "Gujarat", loc: "Vadodara ring road, Gujarat" },
  { name: "Delhi", loc: "Sarai Kale Khan, Delhi" },
  { name: "Haryana", loc: "Panipat toll, Haryana" },
  { name: "Telangana", loc: "Zaheerabad border, Telangana" },
  { name: "Madhya Pradesh", loc: "Indore bypass, Madhya Pradesh" },
];

const TYPE_BLOCKS: TypeBlock[] = [
  {
    type: "traffic_challan",
    urgency: "medium",
    baseDowntime: 8000,
    requiredDocuments: ["Challan copy", "RC", "Insurance"],
    primaryDoc: { claimed: "challan", fields: (reg) => ({ vehicle_number: reg, reason: "Overspeeding", amount: "2000" }) },
    spec: "Traffic challans",
    templates: [
      "Got an e-challan at {loc}. Overspeeding bola hai. Sahi nahi lagta.",
      "Challan mila hai {loc} pe. Amount zyada laga hai. Kya karein?",
      "Officer at {loc} issued a challan for lane violation. Need to dispute.",
    ],
  },
  {
    type: "permit_issue",
    urgency: "high",
    baseDowntime: 30000,
    requiredDocuments: ["National Permit", "RC"],
    primaryDoc: { claimed: "national_permit", fields: (reg) => ({ vehicle_number: reg, permit_no: "NP-" + reg.slice(0, 5), valid_through: "12 Nov 2026" }) },
    spec: "Interstate permits",
    templates: [
      "Permit ko lekar {loc} pe rok diya. Bol rahe hain state permit chahiye.",
      "Stopped at {loc}, they say national permit endorsement missing.",
      "{loc} pe permit check mein pakad liya. Route authorization pooch rahe hain.",
    ],
  },
  {
    type: "vehicle_document_issue",
    urgency: "medium",
    baseDowntime: 12000,
    requiredDocuments: ["PUC", "Insurance", "RC"],
    primaryDoc: { claimed: "puc", fields: (reg) => ({ vehicle_number: reg, valid_through: "01 Aug 2026" }) },
    spec: "Documentation",
    templates: [
      "PUC expire ho gaya bol rahe hain {loc} pe. Check kar rahe hain.",
      "Document check at {loc}. Insurance validity questioned.",
    ],
  },
  {
    type: "tax_border_issue",
    urgency: "high",
    baseDowntime: 22000,
    requiredDocuments: ["E-way bill", "Permit", "Invoice"],
    primaryDoc: { claimed: "unknown", fields: (reg) => ({ vehicle_number: reg, eway_bill: "EWB-" + reg.slice(-4), status: "flagged" }) },
    spec: "Border & tax",
    templates: [
      "Border par {loc} rok diya, entry tax ka bol rahe hain.",
      "Check-post at {loc} flagged the e-way bill. Held up.",
    ],
  },
  {
    type: "driver_document_issue",
    urgency: "medium",
    baseDowntime: 10000,
    requiredDocuments: ["Driving Licence", "RC"],
    primaryDoc: { claimed: "driving_licence", fields: (reg) => ({ vehicle_number: reg, licence_class: "HGV", valid_through: "20 May 2027" }) },
    spec: "Driver documents",
    templates: [
      "Licence endorsement ko lekar {loc} pe rok diya.",
      "At {loc} they questioned my licence class for this vehicle.",
    ],
  },
  {
    type: "accident",
    urgency: "high",
    baseDowntime: 35000,
    requiredDocuments: ["Accident photos", "Insurance", "Driver statement"],
    primaryDoc: { claimed: "accident_photo", fields: (reg) => ({ vehicle_number: reg, scene: "rear-end", injuries: "none reported" }) },
    spec: "Accident claims",
    templates: [
      "Chhoti si takkar ho gayi {loc} pe. Koi chot nahi. Gaadi thodi damage.",
      "Minor accident near {loc}. No injuries. Need insurer guidance.",
    ],
  },
  {
    type: "cargo_issue",
    urgency: "medium",
    baseDowntime: 18000,
    requiredDocuments: ["Goods invoice", "Permit"],
    primaryDoc: { claimed: "unknown", fields: (reg) => ({ vehicle_number: reg, cargo: "textiles", permit_category: "general goods" }) },
    spec: "Cargo",
    templates: [
      "Cargo category ko lekar {loc} pe objection kar rahe hain.",
      "At {loc} they say the cargo doesn't match the permit category.",
    ],
  },
  {
    type: "vehicle_detention",
    urgency: "high",
    baseDowntime: 28000,
    requiredDocuments: ["Detention notice", "RC", "Permit"],
    primaryDoc: { claimed: "seizure_notice", fields: (reg) => ({ vehicle_number: reg, section: "207", date: "10 Jul 2026" }) },
    spec: "Roadside detention",
    templates: [
      "Gaadi detain kar li {loc} pe. Notice de rahe hain.",
      "Vehicle detained at {loc}. Officer citing document deficiency.",
    ],
  },
];

const CHANNELS: Channel[] = ["whatsapp_text", "voice_note", "call_transcript", "manual", "fleet_api"];

// Adversarial modifiers applied to a fraction of generated cases.
type Modifier =
  | "none"
  | "expired_doc"
  | "missing_field"
  | "ocr_swap"
  | "stale"
  | "incomplete_abstain"
  | "owner_mismatch"
  | "overconfident";

const ADVERSARIAL_MODS: Modifier[] = [
  "expired_doc",
  "missing_field",
  "ocr_swap",
  "stale",
  "incomplete_abstain",
  "owner_mismatch",
  "overconfident",
];

export function generateIncidents(count: number): SyntheticIncident[] {
  const rng = mulberry32(seedFrom("generated-incidents-v1"));
  const out: SyntheticIncident[] = [];

  for (let i = 0; i < count; i++) {
    const block = TYPE_BLOCKS[i % TYPE_BLOCKS.length];
    const state = STATES[Math.floor(rng() * STATES.length)];
    const vehicle = VEHICLES[Math.floor(rng() * VEHICLES.length)];
    const driver = DRIVERS.find((d) => d.fleetId === vehicle.fleetId) ?? DRIVERS[0];
    const channel = CHANNELS[Math.floor(rng() * CHANNELS.length)];
    const template = block.templates[Math.floor(rng() * block.templates.length)];
    const raw = template.replace("{loc}", state.loc);

    // ~45% of generated cases get an adversarial modifier.
    const adversarial = rng() < 0.45;
    const mod: Modifier = adversarial ? ADVERSARIAL_MODS[Math.floor(rng() * ADVERSARIAL_MODS.length)] : "none";

    const reg = vehicle.registration;
    const tags: DatasetTag[] = [adversarial ? tagForMod(mod) : "valid"];
    const findings: DocFinding[] = [];
    let suspectedFraud = false;
    let shouldAbstain = false;
    const contradictions: string[] = [];
    const warnings: string[] = [];
    const expectedFailureModes: string[] = [];
    const downtime = block.baseDowntime + Math.floor(rng() * 8000);

    let sys: Parameters<typeof defineIncident>[0]["sys"];
    const docFields = block.primaryDoc.fields(reg);

    switch (mod) {
      case "expired_doc":
        findings.push("expired");
        docFields["valid_through"] = "02 Feb 2025";
        contradictions.push("Reporter implies documents are in order, but a key document is expired.");
        break;
      case "missing_field":
        warnings.push("Vehicle number not stated in the message.");
        expectedFailureModes.push("missing_field");
        break;
      case "ocr_swap":
        findings.push("low_quality_image");
        expectedFailureModes.push("incorrect_ocr");
        contradictions.push("OCR-extracted vehicle number may be misread from a low-quality image.");
        break;
      case "stale":
        warnings.push("Incident appears to be several days old; may be stale.");
        tags.push("delayed_upload");
        break;
      case "incomplete_abstain":
        shouldAbstain = true;
        warnings.push("Insufficient detail to produce a reliable recommendation.");
        sys = { shouldAbstain: true, confidence: 0.44 };
        break;
      case "owner_mismatch":
        findings.push("owner_mismatch");
        suspectedFraud = true;
        contradictions.push("Owner name differs across submitted documents.");
        break;
      case "overconfident":
        expectedFailureModes.push("overconfidence");
        sys = { confidence: 0.96, incidentType: nextType(block.type) };
        break;
    }

    const docs =
      mod === "missing_field"
        ? []
        : [
            doc({
              filename: `${block.type}_${reg}.${channel === "voice_note" ? "txt" : "pdf"}`,
              claimedType: block.primaryDoc.claimed,
              fields: docFields,
              findings,
              preview: `[Synthetic ${block.primaryDoc.claimed.toUpperCase()} for ${reg}]`,
            }),
          ];

    const urgency: Urgency = mod === "expired_doc" || mod === "owner_mismatch" ? "high" : block.urgency;

    out.push(
      defineIncident({
        id: `GEN-${(i + 1).toString().padStart(3, "0")}`,
        title: `${titleFor(block.type)} • ${state.name}`,
        description: `${titleFor(block.type)} reported from ${state.loc}${mod !== "none" ? ` (modifier: ${mod})` : ""}.`,
        channel,
        originalLanguage: raw.match(/[a-z]/) && /[A-Z]/.test(raw) && raw.split(" ").length > 6 ? "en" : "hi-en",
        rawInput: raw,
        fleetId: vehicle.fleetId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        reportedVehicleNumber: mod === "missing_field" ? undefined : reg,
        actualVehicleNumber: reg,
        reportedLocation: state.loc,
        jurisdiction: mod === "incomplete_abstain" ? undefined : state.name,
        estimatedDowntimePerDay: downtime,
        documents: docs,
        incidentType: block.type,
        urgency,
        immobilized: ["permit_issue", "vehicle_detention"].includes(block.type),
        suspectedFraud,
        requiresHumanEscalation: urgency === "critical" || suspectedFraud || shouldAbstain,
        shouldAbstain,
        requiredDocuments: block.requiredDocuments,
        contradictions,
        warnings,
        recommendedLawyerSpecialisation: block.spec,
        expectedFailureModes,
        sys,
        difficulty: adversarial ? (mod === "overconfident" || mod === "ocr_swap" ? "adversarial" : "hard") : "easy",
        tags,
      }),
    );
  }
  return out;
}

function titleFor(type: IncidentType): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nextType(type: IncidentType): IncidentType {
  const order: IncidentType[] = ["permit_issue", "vehicle_detention", "tax_border_issue", "cargo_issue", "traffic_challan"];
  const idx = order.indexOf(type);
  return order[(idx + 1) % order.length] ?? "permit_issue";
}

function tagForMod(mod: Modifier): DatasetTag {
  const map: Record<Modifier, DatasetTag> = {
    none: "valid",
    expired_doc: "expired_permit",
    missing_field: "incomplete",
    ocr_swap: "incorrect_ocr",
    stale: "stale_document",
    incomplete_abstain: "incomplete",
    owner_mismatch: "mismatched_owner",
    overconfident: "overconfident_wrong",
  };
  return map[mod];
}
