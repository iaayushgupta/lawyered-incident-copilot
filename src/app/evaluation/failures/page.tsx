"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ShieldAlert, ArrowUpRight, ArrowLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { USERS } from "@/lib/data/master";
import { can } from "@/lib/rbac";
import { evaluateAll } from "@/lib/evaluation/metrics";
import { DANGEROUS_FAILURE_LABEL, type CaseEvaluation } from "@/lib/evaluation/engine";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";
import { pct, cn } from "@/lib/utils";
import { SectionCard, Card, Tag, KV, EmptyState } from "@/components/ui/primitives";

export default function FailuresPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-ink-muted">Loading evaluation…</div>}>
      <FailuresInner />
    </Suspense>
  );
}

function FailuresInner() {
  const currentUserId = useStore((s) => s.currentUserId);
  const user = USERS.find((u) => u.id === currentUserId)!;
  const params = useSearchParams();
  const dangerousFilter = params.get("dangerous");

  const { cases } = useMemo(() => evaluateAll(), []);
  const failures = useMemo(() => cases.filter((c) => !c.passed), [cases]);

  const failureTypes = useMemo(
    () => Array.from(new Set(failures.map((f) => f.failureType).filter(Boolean))) as string[],
    [failures],
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [onlyDangerous, setOnlyDangerous] = useState<boolean>(!!dangerousFilter);

  const filtered = useMemo(() => {
    return failures.filter((f) => {
      if (dangerousFilter && !f.dangerousFailures.includes(dangerousFilter as never)) return false;
      if (onlyDangerous && f.dangerousFailures.length === 0) return false;
      if (typeFilter !== "all" && f.failureType !== typeFilter) return false;
      return true;
    });
  }, [failures, typeFilter, onlyDangerous, dangerousFilter]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filtered.find((f) => f.syntheticId === selectedId) ?? filtered[0] ?? null;

  if (!can(user.role, "view_evaluation")) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <ShieldAlert className="mx-auto mb-3 text-red-500" size={40} />
        <h2 className="text-lg font-bold text-ink">Access denied</h2>
        <p className="mt-1 text-sm text-ink-muted">Only Legal Ops, Admin, and Auditor roles can view failure analysis.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <Link href="/evaluation" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Evaluation dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Failure Explorer</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {filtered.length} failing cases{dangerousFilter && <> · filtered to <span className="font-semibold">{DANGEROUS_FAILURE_LABEL[dangerousFilter as never] ?? dangerousFilter}</span></>}. Each case: expected vs system output, failure type, and a recommended fix.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Failure type" className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand/50">
            <option value="all">All failure types</option>
            {failureTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setOnlyDangerous((v) => !v)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", onlyDangerous ? "border-red-300 bg-red-50 text-red-700" : "border-line bg-white text-ink-muted")}>
            Dangerous only
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* List */}
        <div className="space-y-2">
          {filtered.map((f) => (
            <button
              key={f.syntheticId}
              onClick={() => setSelectedId(f.syntheticId)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition",
                selected?.syntheticId === f.syntheticId ? "border-brand bg-brand/5" : "border-line bg-white hover:bg-slate-50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{f.title}</span>
                {f.dangerousFailures.length > 0 && <ShieldAlert size={14} className="shrink-0 text-red-500" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Tag tone="red">{f.failureType}</Tag>
                <Tag tone="slate">{f.difficulty}</Tag>
                <span className="text-[11px] text-ink-faint">conf {pct(f.confidence)}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <EmptyState>No failing cases match these filters.</EmptyState>}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="space-y-5">
            <SectionCard
              title={<span className="section-title">{selected.title}</span>}
              right={<Link href={`/incidents/${selected.syntheticId}`} className="link inline-flex items-center gap-1 text-sm">Open case <ArrowUpRight size={14} /></Link>}
            >
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Tag tone="red">{selected.failureType}</Tag>
                {selected.dangerousFailures.map((d) => <Tag key={d} tone="red">⚠ {DANGEROUS_FAILURE_LABEL[d as never] ?? d}</Tag>)}
                {selected.tags.slice(0, 5).map((t) => <Tag key={t} tone="slate">{t}</Tag>)}
              </div>

              {/* Side by side */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Expected (ground truth)</div>
                  <Rows>
                    <Row label="Incident type">{INCIDENT_TYPE_LABEL[selected.expected.incidentType]}</Row>
                    <Row label="Urgency">{selected.expected.urgency}</Row>
                    <Row label="Suspected fraud">{String(selected.expected.suspectedFraud)}</Row>
                    <Row label="Requires escalation">{String(selected.expected.requiresHumanEscalation)}</Row>
                    <Row label="Should abstain">{String(selected.expected.shouldAbstain)}</Row>
                    <Row label="Contradictions">{selected.expected.contradictions.length}</Row>
                  </Rows>
                </Card>
                <Card className="p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">System output</div>
                  <Rows>
                    <Row label="Incident type" bad={!selected.classificationCorrect}>{INCIDENT_TYPE_LABEL[selected.system.incidentType]}</Row>
                    <Row label="Urgency" bad={!selected.urgencyCorrect}>{selected.system.urgency}</Row>
                    <Row label="Suspected fraud" bad={selected.fraudExpected !== selected.fraudPredicted}>{String(selected.system.suspectedFraud)}</Row>
                    <Row label="Requires escalation" bad={selected.escalationExpected !== selected.escalationPredicted}>{String(selected.system.requiresHumanEscalation)}</Row>
                    <Row label="Should abstain" bad={selected.abstentionExpected !== selected.abstentionPredicted}>{String(selected.system.shouldAbstain)}</Row>
                    <Row label="Contradictions" bad={selected.contradictionExpected !== selected.contradictionPredicted}>{selected.system.contradictions.length}</Row>
                  </Rows>
                  <div className="mt-2 text-xs text-ink-faint">Confidence: {pct(selected.system.confidence)} · Sources: {selected.system.sourceIds.join(", ") || "none"}</div>
                </Card>
              </div>
            </SectionCard>

            <SectionCard title="Failure analysis">
              <div className="grid gap-4 sm:grid-cols-2">
                <KV label="Failure type">{selected.failureType}</KV>
                <KV label="Affected workflow component">{selected.affectedComponent}</KV>
                <div className="sm:col-span-2"><KV label="Likely reason">{selected.likelyReason}</KV></div>
                <div className="sm:col-span-2">
                  <div className="kv-label">Recommended system improvement</div>
                  <div className="mt-1 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-ink">{selected.recommendedImprovement}</div>
                </div>
              </div>
            </SectionCard>
          </div>
        ) : (
          <EmptyState>Select a failing case to inspect the expected vs system output.</EmptyState>
        )}
      </div>
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}
function Row({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded px-2 py-1 text-sm", bad && "bg-red-50")}>
      <span className="text-ink-muted">{label}</span>
      <span className={cn("font-medium capitalize", bad ? "text-red-700" : "text-ink")}>{children}</span>
    </div>
  );
}
