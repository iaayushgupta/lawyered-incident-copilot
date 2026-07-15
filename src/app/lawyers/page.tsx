"use client";

import { useMemo, useState } from "react";
import {
  Scale,
  Star,
  Clock,
  Briefcase,
  Globe,
  Languages,
  ArrowRight,
  Check,
  Info,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { LAWYERS, USERS } from "@/lib/data/master";
import { routeIncident } from "@/lib/workflow/routing";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";
import type { Incident, Lawyer, RoutingCandidate } from "@/lib/types";
import { can } from "@/lib/rbac";
import { vehicleReg, lawyerName, visibleIncidents } from "@/lib/view";
import { pct, cn } from "@/lib/utils";
import { SectionCard, Tag, Meter, EmptyState } from "@/components/ui/primitives";

const AVAIL_TONE: Record<Lawyer["availability"], "green" | "amber" | "slate"> = {
  available: "green",
  busy: "amber",
  offline: "slate",
};
const AVAIL_LABEL: Record<Lawyer["availability"], string> = {
  available: "Available",
  busy: "Busy",
  offline: "Offline",
};
const COST_TONE: Record<Lawyer["costBand"], "green" | "blue" | "violet"> = {
  economy: "green",
  standard: "blue",
  premium: "violet",
};
const COST_LABEL: Record<Lawyer["costBand"], string> = {
  economy: "Economy",
  standard: "Standard",
  premium: "Premium",
};

function meterTone(score: number): "brand" | "green" | "amber" | "red" {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "brand";
  if (score >= 0.4) return "amber";
  return "red";
}

export default function LawyersPage() {
  const world = useStore((s) => s.world);
  const currentUserId = useStore((s) => s.currentUserId);
  const assignLawyer = useStore((s) => s.assignLawyer);
  const pushToast = useStore((s) => s.pushToast);
  const user = USERS.find((u) => u.id === currentUserId)!;

  const canAssign = can(user.role, "assign_lawyer");

  const lawyerById = useMemo(
    () => new Map(LAWYERS.map((l) => [l.id, l] as const)),
    [],
  );

  // Incidents this user is allowed to see, routable = not resolved/closed.
  const routableIncidents = useMemo(() => {
    const all = world.order.map((id) => world.incidents[id]);
    const scoped = visibleIncidents(all, user);
    return scoped.filter((i) => i.state !== "resolved" && i.state !== "closed");
  }, [world, user]);

  const [selectedId, setSelectedId] = useState<string>("");

  // Resolve the effective selection (fall back to the first routable incident).
  const effectiveId =
    selectedId && world.incidents[selectedId] ? selectedId : routableIncidents[0]?.id ?? "";
  const incident: Incident | undefined = effectiveId ? world.incidents[effectiveId] : undefined;

  const routing = useMemo(
    () => (incident ? routeIncident(incident, LAWYERS) : undefined),
    [incident],
  );

  const handleAssign = (candidate: RoutingCandidate) => {
    if (!incident) return;
    const manual = candidate.lawyerId !== routing?.recommendedLawyerId;
    if (!candidate.eligible) {
      pushToast(
        "warn",
        `${lawyerName(candidate.lawyerId)} is flagged ineligible — assigning as a manual override.`,
      );
    }
    assignLawyer(incident.id, candidate.lawyerId, manual);
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Scale size={18} />
        </div>
        <div>
          <h1 className="text-[26px] font-bold text-ink">Lawyer Network</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            A mock directory of panel advocates and a transparent routing simulator. Every routing
            score is a deterministic, fully-explained heuristic — not objective truth — and any
            recommendation can be manually overridden.
          </p>
        </div>
      </div>

      {/* Section 1 — Lawyer directory */}
      <SectionCard
        title="Lawyer directory"
        right={
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Info size={13} />
            {LAWYERS.length} advocates · scores marked &ldquo;simulated&rdquo; are prototype data
          </span>
        }
        bodyClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LAWYERS.map((l) => (
            <LawyerCard key={l.id} lawyer={l} />
          ))}
        </div>
        <p className="border-t border-line pt-3 text-xs text-ink-faint">
          Directory, success rate and quality scores are synthetic and generated for this prototype.
          They do not represent any real advocate or verifiable performance record.
        </p>
      </SectionCard>

      {/* Section 2 — Routing simulator */}
      <SectionCard
        title="Routing simulator"
        right={
          <div className="flex items-center gap-2">
            <label htmlFor="incident-select" className="text-xs font-medium text-ink-muted">
              Incident
            </label>
            <select
              id="incident-select"
              aria-label="Select an incident to simulate routing"
              value={effectiveId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={routableIncidents.length === 0}
              className="max-w-[320px] appearance-none rounded-lg border border-line bg-white py-2 pl-3 pr-8 text-sm text-ink outline-none focus:border-brand/50 disabled:opacity-60"
            >
              {routableIncidents.length === 0 && <option value="">No open incidents</option>}
              {routableIncidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.caseNumber} · {vehicleReg(i)} ·{" "}
                  {INCIDENT_TYPE_LABEL[i.triage?.incidentType ?? "unknown_unsupported"]}
                </option>
              ))}
            </select>
          </div>
        }
        bodyClassName="space-y-4"
      >
        {!incident || !routing ? (
          <EmptyState>
            No open incidents are visible to your role, so there is nothing to route. Resolved and
            closed incidents are excluded from the simulator.
          </EmptyState>
        ) : (
          <>
            {/* Incident summary + current assignment */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50/60 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{incident.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  <span>{incident.caseNumber}</span>
                  <span aria-hidden>·</span>
                  <span>{vehicleReg(incident)}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {INCIDENT_TYPE_LABEL[incident.triage?.incidentType ?? "unknown_unsupported"]}
                  </span>
                  {incident.jurisdiction && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{incident.jurisdiction}</span>
                    </>
                  )}
                  <Tag
                    tone={
                      incident.urgency === "critical"
                        ? "red"
                        : incident.urgency === "high"
                          ? "amber"
                          : "slate"
                    }
                  >
                    {incident.urgency}
                  </Tag>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="kv-label">Currently assigned</div>
                <div className="mt-0.5 font-medium text-ink">
                  {incident.assignedLawyerId ? lawyerName(incident.assignedLawyerId) : "Unassigned"}
                </div>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-ink-faint">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                The total score is a transparent, deterministic weighting of the factors shown below.
                It is a decision aid, not objective truth — a human may override it and assign any
                advocate. Ineligible advocates are shown with the reasons they were excluded.
              </span>
            </p>

            {/* Ranked candidates */}
            <div className="space-y-3">
              {routing.candidates.map((c, idx) => {
                const lawyer = lawyerById.get(c.lawyerId);
                if (!lawyer) return null;
                const isRecommended = c.lawyerId === routing.recommendedLawyerId;
                const isAssigned = c.lawyerId === incident.assignedLawyerId;
                return (
                  <div
                    key={c.lawyerId}
                    className={cn(
                      "rounded-xl border p-4",
                      c.eligible ? "border-line bg-white" : "border-line/70 bg-slate-50/50",
                      isRecommended && "border-brand/50 ring-1 ring-brand/20",
                    )}
                  >
                    {/* Candidate header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-ink-muted">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{lawyer.name}</span>
                            {isRecommended && <Tag tone="green">Recommended</Tag>}
                            {isAssigned && <Tag tone="blue">Assigned</Tag>}
                            {c.eligible ? (
                              <Tag tone="green">Eligible</Tag>
                            ) : (
                              <Tag tone="red">Ineligible</Tag>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                            <span className="inline-flex items-center gap-1">
                              <Globe size={12} className="text-ink-faint" />
                              {lawyer.jurisdictions.join(", ")}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} className="text-ink-faint" />
                              {lawyer.medianResponseMinutes} min median
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Star size={12} className="text-amber-500" />
                              {lawyer.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="stat-label">Total score</div>
                          <div className="text-lg font-bold text-ink">{pct(c.totalScore)}</div>
                        </div>
                        {canAssign && (
                          <button
                            onClick={() => handleAssign(c)}
                            disabled={isAssigned}
                            className={cn(
                              "btn-primary inline-flex items-center gap-1.5 text-sm",
                              isAssigned && "pointer-events-none opacity-60",
                            )}
                            aria-label={`Assign ${lawyer.name} to ${incident.caseNumber}`}
                          >
                            {isAssigned ? (
                              <>
                                <Check size={14} /> Assigned
                              </>
                            ) : (
                              <>
                                Assign <ArrowRight size={14} />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ineligible reasons */}
                    {!c.eligible && c.ineligibleReasons.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {c.ineligibleReasons.map((r) => (
                          <li
                            key={r}
                            className="rounded-md bg-sev-criticalBg px-2 py-1 text-xs font-medium text-sev-critical"
                          >
                            {r}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Expanded factor breakdown */}
                    <div className="mt-3 overflow-x-auto">
                      <div className="grid min-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
                        {c.factors.map((f) => (
                          <div
                            key={f.label}
                            className="rounded-lg border border-line/70 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-ink">{f.label}</span>
                              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-faint">
                                {pct(f.score)} · {Math.round(f.weight * 100)}%w
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <Meter value={f.score} tone={meterTone(f.score)} />
                            </div>
                            <div className="mt-1 text-[11px] text-ink-muted">{f.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function LawyerCard({ lawyer }: { lawyer: Lawyer }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{lawyer.name}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            <Star size={13} className="text-amber-500" />
            <span className="font-medium text-ink">{lawyer.rating.toFixed(1)}</span>
            <span className="text-ink-faint">/ 5</span>
          </div>
        </div>
        <Tag tone={AVAIL_TONE[lawyer.availability]}>{AVAIL_LABEL[lawyer.availability]}</Tag>
      </div>

      {/* Specialisations */}
      <div className="flex flex-wrap gap-1.5">
        {lawyer.specialisations.slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Meta */}
      <div className="space-y-1.5 text-xs text-ink-muted">
        <div className="flex items-center gap-1.5">
          <Globe size={13} className="shrink-0 text-ink-faint" />
          <span className="truncate">{lawyer.jurisdictions.join(", ")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Languages size={13} className="shrink-0 text-ink-faint" />
          <span className="truncate">{lawyer.languages.join(", ")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Briefcase size={13} className="shrink-0 text-ink-faint" />
          <span>
            {lawyer.activeCaseload} active {lawyer.activeCaseload === 1 ? "case" : "cases"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0 text-ink-faint" />
          <span>{lawyer.medianResponseMinutes} min median response</span>
        </div>
      </div>

      {/* Cost band */}
      <div className="flex items-center gap-2 text-xs">
        <span className="kv-label">Cost band</span>
        <Tag tone={COST_TONE[lawyer.costBand]}>{COST_LABEL[lawyer.costBand]}</Tag>
      </div>

      {/* Simulated meters */}
      <div className="space-y-2 border-t border-line pt-3">
        <MeterRow label="Success rate (simulated)" value={lawyer.successRate} />
        <MeterRow label="Quality score (simulated)" value={lawyer.qualityScore} />
      </div>
    </div>
  );
}

function MeterRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{pct(value)}</span>
      </div>
      <Meter value={value} tone={meterTone(value)} />
    </div>
  );
}
