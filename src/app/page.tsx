"use client";

import Link from "next/link";
import { ArrowRight, Activity, Truck, IndianRupee, Bot, FileClock, Gavel, TimerReset, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { USERS } from "@/lib/data/master";
import { visibleIncidents, dashboardStats, vehicleReg, driverName, fleetName } from "@/lib/view";
import { inr, cn, URGENCY_ORDER } from "@/lib/utils";
import { UrgencyPill, StatePill, SlaPill } from "@/components/ui/primitives";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";

export default function DashboardPage() {
  const world = useStore((s) => s.world);
  const currentUserId = useStore((s) => s.currentUserId);
  const user = USERS.find((u) => u.id === currentUserId)!;

  const all = world.order.map((id) => world.incidents[id]);
  const incidents = visibleIncidents(all, user);
  const stats = dashboardStats(incidents);

  const priority = [...incidents]
    .filter((i) => i.state !== "resolved" && i.state !== "closed")
    .sort((a, b) => {
      if (URGENCY_ORDER[a.urgency] !== URGENCY_ORDER[b.urgency]) return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      return b.estimatedDowntimePerDay - a.estimatedDowntimePerDay;
    })
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-ink">Legal Operations Command Center</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Prioritize incidents by vehicle downtime and legal urgency — not inbox order.
          </p>
        </div>
        <span className="pill bg-sev-lowBg text-sev-low">● {stats.activeIncidents} live incidents</span>
      </div>

      {/* Primary stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat accent="#2563eb" icon={Truck} label="Vehicles monitored" value={stats.vehiclesMonitored.toLocaleString("en-IN")} sub={`Across ${user.fleetId === "*" ? "3 fleets" : fleetName(user.fleetId)}`} />
        <Stat accent="#ef4444" icon={Activity} label="Active incidents" value={String(stats.activeIncidents)} sub={`${stats.critical} critical · ${stats.immobilized} immobilized`} />
        <Stat accent="#f59e0b" icon={IndianRupee} label="Downtime at risk" value={inr(stats.downtimeAtRisk)} sub="Estimated daily operational exposure" />
        <Stat accent="#14b8a6" icon={Bot} label="AI-assisted" value={`${stats.aiAssistedPct}%`} sub="Cases pre-triaged by the copilot" />
      </div>

      {/* Secondary stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MiniStat icon={FileClock} label="Awaiting documents" value={stats.awaitingDocuments} tone="amber" />
        <MiniStat icon={Gavel} label="Awaiting lawyer review" value={stats.awaitingLawyer} tone="blue" />
        <MiniStat icon={TimerReset} label="Breaching SLA" value={stats.slaBreached} tone="red" />
        <MiniStat icon={CheckCircle2} label="Resolved" value={stats.resolved} tone="green" />
        <MiniStat icon={IndianRupee} label="Est. financial impact" value={inr(stats.financialImpact)} tone="slate" isMoney />
      </div>

      {/* Priority queue */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Priority incident queue</h2>
          <Link href="/incidents" className="link inline-flex items-center gap-1 text-sm">
            View all incidents <ArrowRight size={15} />
          </Link>
        </div>
        <div className="space-y-3">
          {priority.map((i) => (
            <Link
              key={i.id}
              href={`/incidents/${i.id}`}
              className="group flex items-center gap-4 rounded-card border border-line bg-white px-5 py-4 shadow-card transition hover:border-brand/40 hover:shadow-pop"
            >
              <div className="w-[150px] shrink-0">
                <div className="font-bold text-ink">{vehicleReg(i)}</div>
                <div className="text-xs text-ink-faint">{i.caseNumber}</div>
              </div>
              <div className="w-[230px] shrink-0">
                <div className="text-sm font-medium text-ink">{INCIDENT_TYPE_LABEL[i.triage?.incidentType ?? "unknown_unsupported"]}</div>
                <div className="text-xs text-ink-muted">{driverName(i.driverId)} · {i.reportedLocation ?? i.jurisdiction ?? "—"}</div>
              </div>
              <div className="w-[110px] shrink-0"><UrgencyPill urgency={i.urgency} /></div>
              <div className="hidden w-[150px] shrink-0 lg:block"><StatePill state={i.state} /></div>
              <div className="hidden shrink-0 lg:block"><SlaPill state={i.slaState} /></div>
              <div className="ml-auto text-right">
                <div className="font-bold text-ink">{inr(i.estimatedDowntimePerDay)}<span className="text-xs font-normal text-ink-faint">/day</span></div>
                <div className="text-xs font-semibold text-teal group-hover:underline">Open case →</div>
              </div>
            </Link>
          ))}
          {priority.length === 0 && (
            <div className="rounded-card border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-ink-muted">
              No active incidents visible for this role/fleet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ accent, icon: Icon, label, value, sub }: { accent: string; icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-white p-5 shadow-card">
      <div className="absolute inset-y-0 left-0 w-[5px]" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <Icon size={16} className="text-ink-faint" />
      </div>
      <div className="mt-2 text-[30px] font-bold leading-none text-ink">{value}</div>
      <div className="mt-2 text-xs text-ink-muted">{sub}</div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone, isMoney }: { icon: React.ElementType; label: string; value: number | string; tone: "amber" | "blue" | "red" | "green" | "slate"; isMoney?: boolean }) {
  const map = {
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
    red: "text-red-600 bg-red-50",
    green: "text-emerald-600 bg-emerald-50",
    slate: "text-slate-600 bg-slate-100",
  };
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white p-4 shadow-card">
      <div className={cn("grid h-9 w-9 place-items-center rounded-lg", map[tone])}>
        <Icon size={17} />
      </div>
      <div>
        <div className="text-lg font-bold leading-none text-ink">{isMoney ? value : value}</div>
        <div className="mt-1 text-xs text-ink-muted">{label}</div>
      </div>
    </div>
  );
}
