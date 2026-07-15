"use client";

import { useMemo, useState } from "react";
import { Scale, ArrowRight, Check, Clock, ShieldCheck, FileSignature, AlertTriangle } from "lucide-react";
import type { Incident } from "@/lib/types";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";
import { useStore } from "@/lib/store";
import { LAWYERS, USERS } from "@/lib/data/master";
import { routeIncident } from "@/lib/workflow/routing";
import { can } from "@/lib/rbac";
import { getSourceById } from "@/lib/data/sources";
import { cn, pct, clockTime, inrFull } from "@/lib/utils";
import { SectionCard, KV, Meter, Tag, ConfidencePill, UrgencyPill, EmptyState } from "@/components/ui/primitives";
import { driverName, vehicleReg, fleetName, lawyerName } from "@/lib/view";

function useUser() {
  const id = useStore((s) => s.currentUserId);
  return USERS.find((u) => u.id === id)!;
}

// ─────────────────────────── Lawyer handoff + routing ───────────────────────────
export function HandoffPanel({ incident }: { incident: Incident }) {
  const user = useUser();
  const assignLawyer = useStore((s) => s.assignLawyer);
  const canAssign = can(user.role, "assign_lawyer");
  const canOverride = can(user.role, "override_routing");

  const routing = useMemo(() => incident.routing ?? routeIncident(incident, LAWYERS), [incident]);
  const t = incident.triage;
  const plan = incident.actionPlan;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      {/* Auto-generated brief */}
      <SectionCard title="Auto-generated lawyer brief" right={<Tag tone="green">Ready</Tag>}>
        <div className="space-y-4">
          <BriefRow label="Incident summary">{incident.title}. {t && INCIDENT_TYPE_LABEL[t.incidentType]} in {incident.jurisdiction ?? "undetermined jurisdiction"}.</BriefRow>
          <div className="grid grid-cols-2 gap-4">
            <KV label="Vehicle">{vehicleReg(incident)}</KV>
            <KV label="Driver">{driverName(incident.driverId)}</KV>
            <KV label="Fleet">{fleetName(incident.fleetId)}</KV>
            <KV label="Urgency"><UrgencyPill urgency={incident.urgency} /></KV>
          </div>
          <BriefRow label="Allegation / issue">{t?.subcategory ?? "See triage."}</BriefRow>
          <BriefRow label="Evidence inventory">{incident.evidence.map((e) => e.label).join(", ")}</BriefRow>
          {t && t.contradictions.length > 0 && (
            <BriefRow label="Contradictions" tone="red">{t.contradictions.join(" · ")}</BriefRow>
          )}
          <BriefRow label="Document findings">
            {incident.documents.flatMap((d) => d.findings).length
              ? incident.documents.flatMap((d) => d.findings.map((f) => f.replace(/_/g, " "))).join(", ")
              : "No adverse findings."}
          </BriefRow>
          {plan && (
            <BriefRow label="AI-proposed plan">
              {plan.abstained ? "System abstained — no plan proposed." : `${plan.steps.length} steps · confidence ${pct(plan.confidence)}`}
            </BriefRow>
          )}
          <BriefRow label="Risk flags">
            <div className="flex flex-wrap gap-1.5">
              {incident.suspectedFraud && <Tag tone="red">Suspected fraud</Tag>}
              {t?.requiresHumanEscalation && <Tag tone="amber">Escalation required</Tag>}
              {t?.immobilized && <Tag tone="amber">Immobilized · {inrFull(incident.estimatedDowntimePerDay)}/day</Tag>}
              {!incident.suspectedFraud && !t?.requiresHumanEscalation && !t?.immobilized && <Tag tone="green">No elevated risk</Tag>}
            </div>
          </BriefRow>
          <BriefRow label="Source list">
            {plan?.sourceIds.length
              ? plan.sourceIds.map((id) => getSourceById(id)?.citation ?? `⚠ ${id}`).join(" · ")
              : "None attached."}
          </BriefRow>
          {incident.reviews.length > 0 && (
            <BriefRow label="Previous lawyer corrections">
              {incident.reviews.map((r) => `${r.decision.replace(/_/g, " ")}${r.note ? ` (${r.note})` : ""}`).join("; ")}
            </BriefRow>
          )}
        </div>
      </SectionCard>

      {/* Routing */}
      <SectionCard
        title="Lawyer routing"
        right={<Tag tone="slate">Transparent score</Tag>}
      >
        <p className="mb-3 text-xs text-ink-muted">
          A deterministic score — <span className="font-semibold">not an objective truth</span>. All factors are shown; manual override is always available.
        </p>
        {incident.assignedLawyerId && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="font-semibold">Assigned:</span> {lawyerName(incident.assignedLawyerId)}
            {routing.manualOverrideLawyerId && <Tag tone="amber"> manual override</Tag>}
          </div>
        )}
        <div className="space-y-2">
          {routing.candidates.slice(0, 5).map((c, idx) => {
            const l = LAWYERS.find((x) => x.id === c.lawyerId)!;
            const recommended = c.lawyerId === routing.recommendedLawyerId;
            return (
              <details key={c.lawyerId} className="group rounded-lg border border-line">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                  <span className="text-xs font-bold text-ink-faint">#{idx + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{l.name}</span>
                      {recommended && <Tag tone="green">recommended</Tag>}
                      {!c.eligible && <Tag tone="red">ineligible</Tag>}
                    </div>
                    <div className="text-xs text-ink-faint">{l.specialisations.slice(0, 2).join(" · ")} · {l.availability} · {l.medianResponseMinutes}m median</div>
                  </div>
                  <div className="w-16 text-right">
                    <div className="text-sm font-bold text-ink">{pct(c.totalScore)}</div>
                  </div>
                </summary>
                <div className="border-t border-line px-3 py-2">
                  {c.ineligibleReasons.length > 0 && (
                    <div className="mb-2 text-xs text-red-600">Ineligible: {c.ineligibleReasons.join(", ")}</div>
                  )}
                  <div className="space-y-1.5">
                    {c.factors.map((f) => (
                      <div key={f.label} className="grid grid-cols-[130px_1fr_36px] items-center gap-2 text-xs">
                        <span className="text-ink-muted">{f.label}</span>
                        <Meter value={f.score} tone={f.score > 0.7 ? "green" : f.score > 0.4 ? "amber" : "red"} />
                        <span className="text-right text-ink-faint">{Math.round(f.weight * 100)}%w</span>
                      </div>
                    ))}
                  </div>
                  {canAssign && (
                    <button
                      onClick={() => assignLawyer(incident.id, c.lawyerId, !recommended)}
                      className={cn("mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold", recommended ? "bg-brand text-white hover:bg-brand-700" : "border border-line text-ink hover:bg-slate-50")}
                    >
                      {recommended ? "Assign recommended lawyer" : canOverride ? "Manually override → assign" : "Assign"}
                    </button>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function BriefRow({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "red" }) {
  return (
    <div>
      <div className="kv-label">{label}</div>
      <div className={cn("mt-0.5 text-sm", tone === "red" ? "text-red-700" : "text-ink")}>{children}</div>
    </div>
  );
}

// ─────────────────────────── Resolution ───────────────────────────
export function ResolutionPanel({ incident }: { incident: Incident }) {
  const user = useUser();
  const resolve = useStore((s) => s.resolveIncident);
  const events = useStore((s) => s.world.events[incident.id]) ?? [];
  const canResolve = can(user.role, "resolve_incident");
  const [note, setNote] = useState("");
  const r = incident.resolution;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <SectionCard title="Resolution & feedback">
        {r ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KV label="Final classification">{INCIDENT_TYPE_LABEL[r.finalIncidentType]}</KV>
              <KV label="AI recommendation">{r.aiRecommendationAccepted ? <Tag tone="green">Accepted</Tag> : <Tag tone="amber">Corrected</Tag>}</KV>
              <KV label="Time to resolution">{r.timeToResolutionMin} min</KV>
              <KV label="Time to first response">{r.timeToFirstResponseMin} min</KV>
              <KV label="Time to lawyer">{r.timeToLawyerAssignmentMin} min</KV>
              <KV label="Vehicle downtime">{r.vehicleDowntimeMin} min</KV>
              <KV label="Final penalty">{inrFull(r.finalPenalty)}</KV>
              <KV label="Avoided cost">{inrFull(r.avoidedCost)}</KV>
              <KV label="Failure category">{r.failureCategory ?? "—"}</KV>
            </div>
            <KV label="Final action taken">{r.finalActionTaken}</KV>
            {r.lawyerCorrections.length > 0 && (
              <div>
                <div className="kv-label">Lawyer corrections</div>
                <ul className="mt-1 list-inside list-disc text-sm text-ink">{r.lawyerCorrections.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            {r.userFeedback && <KV label="User feedback">“{r.userFeedback}”</KV>}
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-muted">
              This outcome feeds the evaluation dashboard (acceptance rate, correction rate, time-to-resolution).
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState>No resolution captured yet.</EmptyState>
            {canResolve ? (
              <>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Final action / resolution note…" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand/50" />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => resolve(incident.id, true, note)}>
                    <Check size={16} /> Resolve — accepted AI plan
                  </button>
                  <button className="btn-ghost" onClick={() => resolve(incident.id, false, note)}>Resolve — after correction</button>
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-muted">Only a Lawyer or Admin can capture a resolution.</div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Timeline */}
      <SectionCard title="Resolution timeline">
        <ol className="relative space-y-4 border-l border-line pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink-faint">{clockTime(e.at)}</span>
                <span className="text-sm font-medium text-ink">{e.reason}</span>
              </div>
              <div className="text-xs text-ink-faint">{e.from} → {e.to} · {e.actor}</div>
            </li>
          ))}
          {events.length === 0 && <li className="text-sm text-ink-muted">No events yet.</li>}
        </ol>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────── Audit ───────────────────────────
export function IncidentAuditPanel({ incident }: { incident: Incident }) {
  const audit = useStore((s) => s.world.audit[incident.id]) ?? [];
  return (
    <SectionCard title="Incident audit log" right={<Tag tone="slate">{audit.length} entries · append-only</Tag>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Details</th>
              <th className="px-2 py-2">Req ID</th>
              <th className="px-2 py-2">Hash</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} className="border-b border-line/60 align-top">
                <td className="px-2 py-2 whitespace-nowrap text-ink-muted">{clockTime(a.at)}</td>
                <td className="px-2 py-2"><span className="font-medium text-ink">{a.actor}</span><div className="text-[11px] text-ink-faint capitalize">{a.actorRole.replace(/_/g, " ")}</div></td>
                <td className="px-2 py-2"><span className="font-medium capitalize text-ink">{a.action.replace(/_/g, " ")}</span></td>
                <td className="px-2 py-2 text-xs text-ink-muted">
                  {a.reason && <div>{a.reason}</div>}
                  {a.source && <div className="text-ink-faint">src: {a.source}</div>}
                  {a.confidence != null && <div className="text-ink-faint">conf: {pct(a.confidence)}</div>}
                  {a.after != null && <div className="font-mono text-[10px] text-ink-faint">{JSON.stringify(a.after).slice(0, 60)}</div>}
                </td>
                <td className="px-2 py-2 font-mono text-[11px] text-ink-faint">{a.requestId}</td>
                <td className="px-2 py-2 font-mono text-[10px] text-ink-faint">{a.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
