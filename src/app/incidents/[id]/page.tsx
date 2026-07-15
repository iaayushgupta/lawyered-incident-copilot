"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Play, RotateCcw, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { USERS } from "@/lib/data/master";
import { can } from "@/lib/rbac";
import { visibleIncidents, vehicleReg, driverName, fleetName } from "@/lib/view";
import { UrgencyPill, StatePill, SlaPill, Tag } from "@/components/ui/primitives";
import { Stepper } from "@/components/incident/Stepper";
import { IntakePanel, DocumentsPanel, EvidencePanel, ActionPlanPanel } from "@/components/incident/panels";
import { HandoffPanel, ResolutionPanel, IncidentAuditPanel } from "@/components/incident/panels2";
import { cn } from "@/lib/utils";
import { WORKFLOW_STATE_LABEL } from "@/lib/types";

const TABS = [
  { key: "intake", label: "Intake & Triage" },
  { key: "documents", label: "Documents" },
  { key: "evidence", label: "Evidence" },
  { key: "plan", label: "Action Plan" },
  { key: "handoff", label: "Lawyer Handoff" },
  { key: "resolution", label: "Resolution" },
  { key: "audit", label: "Audit" },
] as const;

export default function IncidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const world = useStore((s) => s.world);
  const currentUserId = useStore((s) => s.currentUserId);
  const advance = useStore((s) => s.advance);
  const reset = useStore((s) => s.resetIncident);
  const user = USERS.find((u) => u.id === currentUserId)!;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("intake");

  const incident = world.incidents[id];
  if (!incident) return notFound();

  // Tenant isolation enforcement.
  const visible = visibleIncidents(world.order.map((x) => world.incidents[x]), user);
  if (!visible.some((i) => i.id === id)) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <ShieldAlert className="mx-auto mb-3 text-red-500" size={40} />
        <h2 className="text-lg font-bold text-ink">Access denied</h2>
        <p className="mt-1 text-sm text-ink-muted">
          This incident belongs to {fleetName(incident.fleetId)}. Your role ({user.role.replace(/_/g, " ")}) is scoped to
          {" "}{fleetName(user.fleetId)} only. Tenant isolation prevents cross-fleet access.
        </p>
        <Link href="/incidents" className="link mt-4 inline-block">← Back to incidents</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <Link href="/incidents" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> All incidents
      </Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{vehicleReg(incident)}</h1>
              <span className="text-sm text-ink-faint">· {incident.caseNumber}</span>
              {incident.suspectedFraud && <Tag tone="red">⚠ Suspected fraud</Tag>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {incident.title} · {fleetName(incident.fleetId)} · {driverName(incident.driverId)} · {incident.reportedLocation ?? incident.jurisdiction ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyPill urgency={incident.urgency} />
            <StatePill state={incident.state} />
            <SlaPill state={incident.slaState} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Stepper state={incident.state} />
          {can(user.role, "run_workflow") && (
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={() => advance(incident.id)} title="Advance one workflow step">
                <Play size={15} /> Run next step
              </button>
              <button className="btn-ghost" onClick={() => reset(incident.id)} title="Reset to seeded state">
                <RotateCcw size={15} /> Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              tab === tb.key ? "text-brand" : "text-ink-muted hover:text-ink",
            )}
          >
            {tb.label}
            {tab === tb.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div>
        {tab === "intake" && <IntakePanel incident={incident} />}
        {tab === "documents" && <DocumentsPanel incident={incident} />}
        {tab === "evidence" && <EvidencePanel incident={incident} />}
        {tab === "plan" && <ActionPlanPanel incident={incident} />}
        {tab === "handoff" && <HandoffPanel incident={incident} />}
        {tab === "resolution" && <ResolutionPanel incident={incident} />}
        {tab === "audit" && <IncidentAuditPanel incident={incident} />}
      </div>
    </div>
  );
}
