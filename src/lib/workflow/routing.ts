// ─────────────────────────────────────────────────────────────────────────────
// Lawyer routing — transparent, deterministic scoring.
//
// The score is explicitly NOT presented as objective truth. Every factor and
// its weight is surfaced, and a manual override is always available.
// ─────────────────────────────────────────────────────────────────────────────

import type { Incident, IncidentType, Lawyer, RoutingCandidate, RoutingFactor, RoutingResult } from "../types";

interface RoutingInput {
  incidentType: IncidentType;
  jurisdiction?: string;
  language?: string;
  specialisation?: string;
  urgency: string;
}

const WEIGHTS = {
  jurisdiction: 0.25,
  specialisation: 0.2,
  incidentSupport: 0.15,
  availability: 0.12,
  workload: 0.1,
  responseTime: 0.08,
  successRate: 0.06,
  language: 0.04,
};

export function scoreLawyer(lawyer: Lawyer, input: RoutingInput): RoutingCandidate {
  const factors: RoutingFactor[] = [];
  const ineligibleReasons: string[] = [];

  const jurisdictionMatch = input.jurisdiction
    ? lawyer.jurisdictions.some((j) => input.jurisdiction!.includes(j) || j === "All India")
    : true;
  factors.push({
    label: "Jurisdiction match",
    weight: WEIGHTS.jurisdiction,
    score: jurisdictionMatch ? 1 : 0,
    detail: jurisdictionMatch
      ? `Covers ${input.jurisdiction ?? "any jurisdiction"}`
      : `Does not cover ${input.jurisdiction}`,
  });
  if (!jurisdictionMatch) ineligibleReasons.push("No jurisdiction coverage");

  const supportsType = lawyer.supportedIncidentTypes.includes(input.incidentType);
  factors.push({
    label: "Supports incident type",
    weight: WEIGHTS.incidentSupport,
    score: supportsType ? 1 : 0,
    detail: supportsType ? "Handles this incident type" : "Does not handle this incident type",
  });
  if (!supportsType) ineligibleReasons.push("Does not support incident type");

  const specMatch = input.specialisation
    ? lawyer.specialisations.some((s) => s.toLowerCase().includes(input.specialisation!.toLowerCase()))
    : lawyer.specialisations.length > 0;
  factors.push({
    label: "Specialisation fit",
    weight: WEIGHTS.specialisation,
    score: specMatch ? 1 : 0.4,
    detail: specMatch ? `Specialises in ${input.specialisation ?? "relevant area"}` : "Adjacent specialisation",
  });

  const availScore = lawyer.availability === "available" ? 1 : lawyer.availability === "busy" ? 0.4 : 0;
  factors.push({
    label: "Availability",
    weight: WEIGHTS.availability,
    score: availScore,
    detail: `Currently ${lawyer.availability}`,
  });
  if (lawyer.availability === "offline") ineligibleReasons.push("Currently offline");

  const workloadScore = clamp(1 - lawyer.activeCaseload / 12);
  factors.push({
    label: "Workload headroom",
    weight: WEIGHTS.workload,
    score: workloadScore,
    detail: `${lawyer.activeCaseload} active cases`,
  });

  const responseScore = clamp(1 - lawyer.medianResponseMinutes / 30);
  factors.push({
    label: "Response speed",
    weight: WEIGHTS.responseTime,
    score: responseScore,
    detail: `Median ${lawyer.medianResponseMinutes} min`,
  });

  factors.push({
    label: "Historical success (simulated)",
    weight: WEIGHTS.successRate,
    score: lawyer.successRate,
    detail: `${Math.round(lawyer.successRate * 100)}% simulated success`,
  });

  const langMatch = input.language ? lawyer.languages.includes(input.language) : true;
  factors.push({
    label: "Language match",
    weight: WEIGHTS.language,
    score: langMatch ? 1 : 0.3,
    detail: langMatch ? `Speaks ${input.language ?? "required language"}` : "Language gap",
  });

  const totalScore = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
  const eligible = ineligibleReasons.length === 0;

  return {
    lawyerId: lawyer.id,
    totalScore: Math.round(totalScore * 1000) / 1000,
    factors,
    eligible,
    ineligibleReasons,
  };
}

export function routeIncident(incident: Incident, lawyers: Lawyer[], overrideId?: string): RoutingResult {
  const input: RoutingInput = {
    incidentType: incident.triage?.incidentType ?? "unknown_unsupported",
    jurisdiction: incident.jurisdiction,
    language: incident.originalLanguage === "en" ? "English" : "Hindi",
    specialisation: incident.actionPlan?.suggestedLawyerSpecialisation ?? incident.triage?.subcategory,
    urgency: incident.urgency,
  };

  const candidates = lawyers
    .map((l) => scoreLawyer(l, input))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.totalScore - a.totalScore;
    });

  const recommended = candidates.find((c) => c.eligible) ?? candidates[0];

  return {
    candidates,
    recommendedLawyerId: recommended?.lawyerId,
    manualOverrideLawyerId: overrideId,
  };
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}
