"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { USERS, LAWYERS } from "@/lib/data/master";
import { visibleIncidents, vehicleReg, driverName, fleetName, lawyerName, slaCountdown } from "@/lib/view";
import { UrgencyPill, StatePill, SlaPill, ConfidencePill } from "@/components/ui/primitives";
import { INCIDENT_TYPE_LABEL, WORKFLOW_STATE_LABEL } from "@/lib/types";
import type { Incident, IncidentType, Urgency, WorkflowState } from "@/lib/types";
import { inr, cn, URGENCY_ORDER } from "@/lib/utils";

type SortKey = "created" | "urgency" | "downtime" | "confidence";

export default function IncidentsPage() {
  const world = useStore((s) => s.world);
  const currentUserId = useStore((s) => s.currentUserId);
  const user = USERS.find((u) => u.id === currentUserId)!;
  const all = world.order.map((id) => world.incidents[id]);
  const scoped = visibleIncidents(all, user);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<WorkflowState | "all">("all");
  const [urgency, setUrgency] = useState<Urgency | "all">("all");
  const [type, setType] = useState<IncidentType | "all">("all");
  const [jur, setJur] = useState<string>("all");
  const [conf, setConf] = useState<"all" | "high" | "medium" | "low">("all");
  const [lawyer, setLawyer] = useState<string>("all");
  const [fraud, setFraud] = useState(false);
  const [breach, setBreach] = useState(false);
  const [sort, setSort] = useState<SortKey>("urgency");

  const jurisdictions = useMemo(
    () => Array.from(new Set(scoped.map((i) => i.jurisdiction).filter(Boolean))) as string[],
    [scoped],
  );

  const filtered = useMemo(() => {
    let rows = scoped.filter((i) => {
      if (status !== "all" && i.state !== status) return false;
      if (urgency !== "all" && i.urgency !== urgency) return false;
      if (type !== "all" && i.triage?.incidentType !== type) return false;
      if (jur !== "all" && i.jurisdiction !== jur) return false;
      if (lawyer !== "all" && i.assignedLawyerId !== lawyer) return false;
      if (fraud && !i.suspectedFraud) return false;
      if (breach && i.slaState !== "breached") return false;
      if (conf !== "all") {
        const c = i.confidence;
        if (conf === "high" && c < 0.85) return false;
        if (conf === "medium" && (c < 0.6 || c >= 0.85)) return false;
        if (conf === "low" && c >= 0.6) return false;
      }
      if (q) {
        const hay = `${vehicleReg(i)} ${i.caseNumber} ${driverName(i.driverId)} ${i.reportedLocation ?? ""} ${i.jurisdiction ?? ""} ${INCIDENT_TYPE_LABEL[i.triage?.incidentType ?? "unknown_unsupported"]}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    rows = rows.sort((a, b) => {
      switch (sort) {
        case "urgency":
          return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || b.estimatedDowntimePerDay - a.estimatedDowntimePerDay;
        case "downtime":
          return b.estimatedDowntimePerDay - a.estimatedDowntimePerDay;
        case "confidence":
          return a.confidence - b.confidence;
        case "created":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return rows;
  }, [scoped, status, urgency, type, jur, conf, lawyer, fraud, breach, q, sort]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Live Incidents</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {filtered.length} of {scoped.length} incidents
            {user.fleetId !== "*" && ` · scoped to ${fleetName(user.fleetId)}`}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vehicle, case, driver, location…"
              className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand/50"
            />
          </div>
          <Select value={status} onChange={(v) => setStatus(v as WorkflowState | "all")} label="Status" options={[["all", "All statuses"], ...Object.entries(WORKFLOW_STATE_LABEL)]} />
          <Select value={urgency} onChange={(v) => setUrgency(v as Urgency | "all")} label="Urgency" options={[["all", "All urgency"], ["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
          <Select value={type} onChange={(v) => setType(v as IncidentType | "all")} label="Type" options={[["all", "All types"], ...Object.entries(INCIDENT_TYPE_LABEL)]} />
          <Select value={jur} onChange={setJur} label="Jurisdiction" options={[["all", "All jurisdictions"], ...jurisdictions.map((j) => [j, j] as [string, string])]} />
          <Select value={conf} onChange={(v) => setConf(v as "all" | "high" | "medium" | "low")} label="Confidence" options={[["all", "Any confidence"], ["high", "High (≥85%)"], ["medium", "Medium"], ["low", "Low (<60%)"]]} />
          <Select value={lawyer} onChange={setLawyer} label="Lawyer" options={[["all", "Any lawyer"], ...LAWYERS.map((l) => [l.id, l.name] as [string, string])]} />
          <Toggle checked={fraud} onChange={setFraud} label="Suspected fraud" />
          <Toggle checked={breach} onChange={setBreach} label="SLA breach" />
          <Select value={sort} onChange={(v) => setSort(v as SortKey)} label="Sort" icon options={[["urgency", "Sort: Urgency"], ["downtime", "Sort: Downtime"], ["confidence", "Sort: Confidence ↑"], ["created", "Sort: Newest"]]} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-ink-faint">
                <Th>Case / Vehicle</Th>
                <Th>Fleet / Driver</Th>
                <Th>Location</Th>
                <Th>Type</Th>
                <Th>Urgency</Th>
                <Th>Status</Th>
                <Th>Conf.</Th>
                <Th>Downtime</Th>
                <Th>Lawyer</Th>
                <Th>SLA</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <Row key={i.id} i={i} />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-ink-muted">No incidents match the current filters.</div>
        )}
      </div>
    </div>
  );
}

function Row({ i }: { i: Incident }) {
  return (
    <tr className="border-b border-line/70 last:border-0 hover:bg-slate-50/50">
      <Td>
        <Link href={`/incidents/${i.id}`} className="block">
          <div className="font-semibold text-ink hover:text-brand">{vehicleReg(i)}</div>
          <div className="flex items-center gap-1 text-xs text-ink-faint">
            {i.caseNumber}
            {i.suspectedFraud && <AlertTriangle size={12} className="text-red-500" />}
          </div>
        </Link>
      </Td>
      <Td>
        <div className="text-ink">{fleetName(i.fleetId)}</div>
        <div className="text-xs text-ink-faint">{driverName(i.driverId)}</div>
      </Td>
      <Td className="text-ink-muted">{i.reportedLocation ?? i.jurisdiction ?? "—"}</Td>
      <Td>{INCIDENT_TYPE_LABEL[i.triage?.incidentType ?? "unknown_unsupported"]}</Td>
      <Td><UrgencyPill urgency={i.urgency} /></Td>
      <Td><StatePill state={i.state} /></Td>
      <Td><ConfidencePill score={i.confidence} label="" /></Td>
      <Td className="font-medium text-ink">{inr(i.estimatedDowntimePerDay)}/d</Td>
      <Td className="text-ink-muted">{lawyerName(i.assignedLawyerId)}</Td>
      <Td>
        <div className="flex flex-col gap-1">
          <SlaPill state={i.slaState} />
          <span className="text-[11px] text-ink-faint">{slaCountdown(i)}</span>
        </div>
      </Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

function Select({ value, onChange, options, label, icon }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string; icon?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-line bg-white py-2 pl-3 pr-8 text-sm text-ink outline-none focus:border-brand/50"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {icon ? <ArrowUpDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" /> : <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint">▾</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm font-medium transition",
        checked ? "border-brand bg-brand/10 text-brand" : "border-line bg-white text-ink-muted hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}
