"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Audit & Observability
//
// A global, append-only, hash-chained audit log plus an observability panel:
// provider health (simulated), deterministic error-injection toggles, and a
// live integrity check that demonstrates tamper detection. All data is synthetic.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Bug,
  Clock,
  Download,
  AlertTriangle,
  CheckCircle2,
  Database,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { verifyChain, GENESIS_HASH } from "@/lib/audit";
import { FAULTS, type FaultId, type FaultMeta } from "@/lib/providers/faults";
import { USERS } from "@/lib/data/master";
import { can } from "@/lib/rbac";
import { visibleIncidents, fleetName } from "@/lib/view";
import { clockTime, relTime, pct, cn } from "@/lib/utils";
import { SectionCard, Card, Tag, Meter, EmptyState } from "@/components/ui/primitives";
import { ROLE_LABEL, WORKFLOW_STATE_LABEL } from "@/lib/types";
import type { AuditEntry, Incident } from "@/lib/types";

// ── Layer presentation ───────────────────────────────────────────────────────
const LAYER_LABEL: Record<FaultMeta["layer"], string> = {
  document: "Document understanding",
  understanding: "Incident understanding",
  retrieval: "Legal retrieval",
  recommendation: "Recommendation / action plan",
  workflow: "Workflow orchestration",
  infra: "Infrastructure",
};
const LAYER_ORDER: FaultMeta["layer"][] = [
  "document",
  "understanding",
  "retrieval",
  "recommendation",
  "workflow",
  "infra",
];

// ── Simulated provider catalogue (fixed, deterministic) ──────────────────────
interface ProviderRow {
  name: string;
  version: string;
  baseLatencyMs: number;
  baseErrorRate: number; // 0..1
  // faults that, when active, degrade this provider
  latencyFaults: FaultId[];
  errorFaults: FaultId[];
}
const PROVIDERS: ProviderRow[] = [
  {
    name: "IncidentUnderstanding",
    version: "mock-2026.07",
    baseLatencyMs: 120,
    baseErrorRate: 0.008,
    latencyFaults: ["delayed_response"],
    errorFaults: ["provider_timeout", "malformed_json", "missing_fields", "incorrect_classification"],
  },
  {
    name: "Document",
    version: "mock-2026.07",
    baseLatencyMs: 340,
    baseErrorRate: 0.014,
    latencyFaults: ["delayed_response"],
    errorFaults: ["provider_timeout", "malformed_json", "ocr_digit_swap"],
  },
  {
    name: "LegalRetrieval",
    version: "mock-2026.07",
    baseLatencyMs: 85,
    baseErrorRate: 0.006,
    latencyFaults: ["delayed_response"],
    errorFaults: ["provider_timeout", "hallucinated_citation", "wrong_jurisdiction", "stale_data"],
  },
  {
    name: "Recommendation",
    version: "mock-2026.07",
    baseLatencyMs: 210,
    baseErrorRate: 0.011,
    latencyFaults: ["delayed_response"],
    errorFaults: ["provider_timeout", "malformed_json", "missing_citations", "overconfidence"],
  },
];

export default function AuditPage() {
  const world = useStore((s) => s.world);
  const currentUserId = useStore((s) => s.currentUserId);
  const faults = useStore((s) => s.faults);
  const toggleFault = useStore((s) => s.toggleFault);
  const auditTampered = useStore((s) => s.auditTampered);
  const tamperAudit = useStore((s) => s.tamperAudit);
  const pushToast = useStore((s) => s.pushToast);

  const user = USERS.find((u) => u.id === currentUserId)!;

  const canToggle = can(user.role, "toggle_faults");
  const canExport = can(user.role, "export_data");
  const canTamper = ["admin", "auditor", "legal_ops"].includes(user.role);

  // ── Visible incidents (tenant scoped) ────────────────────────────────────────
  const all = useMemo(
    () => visibleIncidents(world.order.map((id) => world.incidents[id]), user),
    [world.order, world.incidents, user],
  );

  // ── Observability stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalEntries = 0;
    let abstentions = 0;
    let failures = 0;
    let stuckReview = 0;
    let unsupportedOutputs = 0;
    for (const inc of all) {
      totalEntries += world.audit[inc.id]?.length ?? 0;
      if (inc.state === "abstained") abstentions += 1;
      if (inc.state === "failed") failures += 1;
      if (inc.state === "human_review_required") stuckReview += 1;
      const flagged = inc.actionPlan?.steps?.some(
        (s) => s.markedUnsupported || s.sourceIds.length === 0,
      );
      if (flagged) unsupportedOutputs += 1;
    }
    return {
      totalEntries,
      abstentions,
      failures,
      stuckReview,
      unsupportedOutputs,
      activeFaults: faults.size,
    };
  }, [all, world.audit, faults]);

  // ── Simulated provider health ────────────────────────────────────────────────
  const providerRows = useMemo(() => {
    return PROVIDERS.map((p) => {
      const delayed = p.latencyFaults.some((f) => faults.has(f));
      const errorHits = p.errorFaults.filter((f) => faults.has(f)).length;
      const latencyMs = delayed ? Math.round(p.baseLatencyMs * 3.2) : p.baseLatencyMs;
      // Each active matching fault materially raises the simulated error rate.
      const errorRate = Math.min(1, p.baseErrorRate + errorHits * 0.22);
      const timedOut = faults.has("provider_timeout") && p.errorFaults.includes("provider_timeout");
      const status: "healthy" | "degraded" | "failing" = timedOut
        ? "failing"
        : errorHits > 0 || delayed
          ? "degraded"
          : "healthy";
      return { ...p, latencyMs, errorRate, status };
    });
  }, [faults]);

  // ── Integrity check ──────────────────────────────────────────────────────────
  const integrity = useMemo(() => {
    if (auditTampered) {
      // Take the first visible incident with ≥2 audit entries, clone its chain,
      // corrupt entry[1]'s action WITHOUT recomputing its hash, then verify.
      const target = all.find((inc) => (world.audit[inc.id]?.length ?? 0) >= 2);
      if (!target) {
        return {
          mode: "tampered" as const,
          target: undefined as Incident | undefined,
          corrupted: undefined as AuditEntry | undefined,
          issues: [] as ReturnType<typeof verifyChain>,
        };
      }
      const original = world.audit[target.id];
      const cloned: AuditEntry[] = original.map((e) => ({ ...e }));
      cloned[1] = { ...cloned[1], action: `${cloned[1].action} …(tampered)` };
      const issues = verifyChain(cloned);
      return {
        mode: "tampered" as const,
        target: target as Incident | undefined,
        corrupted: cloned[1] as AuditEntry | undefined,
        issues,
      };
    }
    // Verify each visible incident's real chain.
    let checked = 0;
    let totalIssues = 0;
    for (const inc of all) {
      const chain = world.audit[inc.id];
      if (!chain || chain.length === 0) continue;
      checked += 1;
      totalIssues += verifyChain(chain).length;
    }
    return { mode: "verified" as const, checked, totalIssues };
  }, [auditTampered, all, world.audit]);

  // ── Global audit log (flattened, newest first, capped) ───────────────────────
  const logRows = useMemo(() => {
    const rows: AuditEntry[] = [];
    for (const inc of all) {
      const chain = world.audit[inc.id];
      if (chain) rows.push(...chain);
    }
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return rows.slice(0, 120);
  }, [all, world.audit]);

  // ── Export ───────────────────────────────────────────────────────────────────
  function handleExport() {
    const entries: AuditEntry[] = [];
    for (const inc of all) {
      const chain = world.audit[inc.id];
      if (chain) entries.push(...chain);
    }
    entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("success", `Exported ${entries.length} audit entries (synthetic).`);
  }

  // ── RBAC guard (after all hooks, to keep hook order stable across roles) ─────
  if (!can(user.role, "view_audit")) {
    return (
      <div className="mx-auto flex max-w-[720px] items-center justify-center py-20">
        <Card className="w-full p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-sev-criticalBg">
            <ShieldAlert size={24} className="text-sev-critical" />
          </div>
          <h1 className="text-xl font-bold text-ink">Access denied</h1>
          <p className="mx-auto mt-2 max-w-[520px] text-sm text-ink-muted">
            The audit log and observability controls are restricted. Only{" "}
            <span className="font-semibold text-ink">Legal Operations</span>,{" "}
            <span className="font-semibold text-ink">Administrator</span>, and{" "}
            <span className="font-semibold text-ink">Auditor</span> roles may view this screen. You are
            currently signed in as <span className="font-semibold text-ink">{ROLE_LABEL[user.role]}</span>.
          </p>
          <p className="mt-4 text-xs text-ink-faint">
            Switch role from the top-right menu to view as a permitted user (RBAC demo).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Audit &amp; Observability</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Global append-only audit trail, provider health, and integrity verification
            {user.fleetId !== "*" ? ` · scoped to ${fleetName(user.fleetId)}` : " · all fleets (cross-tenant)"}.
          </p>
        </div>
        {canExport && (
          <button className="btn-ghost" onClick={handleExport}>
            <Download size={15} />
            Export JSON
          </button>
        )}
      </div>

      {/* Observability stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<ShieldCheck size={16} />} label="Audit entries" value={stats.totalEntries} tone="brand" />
        <Stat icon={<AlertTriangle size={16} />} label="Abstentions" value={stats.abstentions} tone="violet" />
        <Stat icon={<Bug size={16} />} label="Workflow failures" value={stats.failures} tone={stats.failures ? "red" : "slate"} />
        <Stat icon={<Clock size={16} />} label="Awaiting human review" value={stats.stuckReview} tone={stats.stuckReview ? "amber" : "slate"} />
        <Stat icon={<AlertTriangle size={16} />} label="Unsupported outputs" value={stats.unsupportedOutputs} tone={stats.unsupportedOutputs ? "amber" : "slate"} />
        <Stat icon={<Activity size={16} />} label="Active injected faults" value={stats.activeFaults} tone={stats.activeFaults ? "red" : "green"} />
      </div>

      {/* Provider health (simulated) */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-brand" />
            <h2 className="section-title">Provider health</h2>
            <Tag tone="slate">simulated</Tag>
          </div>
        }
        right={<span className="text-xs text-ink-faint">Latency &amp; error rates are illustrative, not measured.</span>}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-ink-faint">
                <Th>Provider</Th>
                <Th>Version</Th>
                <Th>Sim. latency</Th>
                <Th>Sim. error rate</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {providerRows.map((p) => (
                <tr key={p.name} className="border-b border-line/70 last:border-0">
                  <Td className="font-semibold text-ink">{p.name}</Td>
                  <Td className="font-mono text-xs text-ink-muted">{p.version}</Td>
                  <Td className="text-ink">
                    <span className={cn(p.latencyMs > p.baseLatencyMs && "font-semibold text-sev-high")}>
                      ~{p.latencyMs} ms
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Meter value={Math.min(1, p.errorRate * 2)} tone={p.errorRate >= 0.2 ? "red" : p.errorRate >= 0.05 ? "amber" : "green"} />
                      </div>
                      <span className="tabular-nums text-ink-muted">{pct(p.errorRate)}</span>
                    </div>
                  </Td>
                  <Td>
                    {p.status === "healthy" ? (
                      <Tag tone="green">Healthy</Tag>
                    ) : p.status === "degraded" ? (
                      <Tag tone="amber">Degraded</Tag>
                    ) : (
                      <Tag tone="red">Failing</Tag>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Error-injection controls */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Bug size={18} className="text-brand" />
            <h2 className="section-title">Error injection</h2>
            {!canToggle && <Tag tone="slate">read-only</Tag>}
          </div>
        }
        right={<span className="pill bg-slate-100 text-slate-600">{faults.size} active</span>}
      >
        <p className="mb-4 max-w-3xl text-sm text-ink-muted">
          These faults deterministically degrade the mock providers so the system&apos;s failure-handling
          (abstention, source-grounding gates, idempotency, human escalation) can be demonstrated. Toggles take
          effect on the <span className="font-semibold text-ink">next live &ldquo;Run next step&rdquo;</span> or
          re-run within an incident — they do not retroactively rewrite existing records.
          {!canToggle && " Your role can view the current configuration but not change it."}
        </p>

        <div className="space-y-5">
          {LAYER_ORDER.map((layer) => {
            const group = FAULTS.filter((f) => f.layer === layer);
            if (group.length === 0) return null;
            return (
              <div key={layer}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="kv-label">{LAYER_LABEL[layer]}</div>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map((f) => {
                    const active = faults.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!canToggle}
                        title={f.description}
                        aria-pressed={active}
                        onClick={() => {
                          if (!canToggle) return;
                          toggleFault(f.id);
                          pushToast(
                            "info",
                            active ? `Cleared fault: ${f.label}` : `Injected fault: ${f.label}`,
                          );
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-sm font-medium transition",
                          active
                            ? "border-brand bg-brand/10 text-brand"
                            : "border-line bg-white text-ink-muted hover:bg-slate-50",
                          !canToggle && "cursor-not-allowed opacity-70 hover:bg-white",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-block h-2 w-2 rounded-full",
                              active ? "bg-brand" : "bg-slate-300",
                            )}
                          />
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Audit-chain integrity */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand" />
            <h2 className="section-title">Audit-chain integrity</h2>
          </div>
        }
        right={
          canTamper && (
            <button
              className={cn(auditTampered ? "btn-primary" : "btn-ghost")}
              onClick={() => {
                tamperAudit();
                pushToast(
                  "warn",
                  auditTampered ? "Tamper simulation cleared." : "Tamper simulation enabled — integrity check will flag it.",
                );
              }}
            >
              {auditTampered ? "Reset chain" : "Simulate tampering"}
            </button>
          )
        }
      >
        <p className="mb-4 max-w-3xl text-sm text-ink-muted">
          Every incident keeps its own append-only, hash-chained log starting from a genesis hash. Each entry
          binds its content to the previous entry&apos;s hash, so any deletion or edit breaks the chain and is
          detectable. There is deliberately no delete API: a request to erase audit history is a modelled
          adversarial case that the system <span className="font-semibold text-ink">refuses by design</span>.
        </p>

        {integrity.mode === "verified" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sev-low">
              <CheckCircle2 size={18} />
              <span className="font-semibold">Chain verified — no integrity issues</span>
            </div>
            <p className="mt-1 text-sm text-emerald-800/90">
              Re-hashed and link-checked {integrity.checked} incident chain{integrity.checked === 1 ? "" : "s"};{" "}
              {integrity.totalIssues} issue{integrity.totalIssues === 1 ? "" : "s"} detected. Genesis hash{" "}
              <code className="font-mono text-xs">{GENESIS_HASH}</code>.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-sev-criticalBg px-4 py-3">
            <div className="flex items-center gap-2 text-sev-critical">
              <ShieldAlert size={18} />
              <span className="font-semibold">Integrity violation detected — audit-log gap</span>
            </div>
            {integrity.target ? (
              <>
                <p className="mt-1 text-sm text-red-900/90">
                  A single entry in{" "}
                  <span className="font-semibold">{integrity.target.caseNumber}</span> was altered after the fact
                  (action rewritten without re-signing the chain). <code className="font-mono text-xs">verifyChain</code>{" "}
                  caught it:
                </p>
                <div className="mt-3 overflow-x-auto rounded-md border border-red-200 bg-white/70">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-red-200 text-left text-xs uppercase tracking-wide text-red-700/80">
                        <Th>Index</Th>
                        <Th>Entry ID</Th>
                        <Th>Problem</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrity.issues.map((iss, k) => (
                        <tr key={`${iss.entryId}-${k}`} className="border-b border-red-100 last:border-0">
                          <Td className="font-mono text-xs text-ink">{iss.index}</Td>
                          <Td className="font-mono text-xs text-ink">{iss.entryId}</Td>
                          <Td>
                            <Tag tone="red">{iss.problem === "hash_mismatch" ? "Hash mismatch" : "Broken link"}</Tag>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {integrity.corrupted && (
                  <p className="mt-2 text-xs text-red-800/80">
                    Tampered action value: <span className="font-mono">&ldquo;{integrity.corrupted.action}&rdquo;</span>{" "}
                    — its stored hash no longer matches <code className="font-mono">hashEntry()</code>.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-red-900/90">
                No visible incident has a chain long enough (≥2 entries) to demonstrate tampering.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Global audit log */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Database size={18} className="text-brand" />
            <h2 className="section-title">Global audit log</h2>
          </div>
        }
        right={
          <span className="text-xs text-ink-faint">
            Showing {logRows.length} most-recent entries across {all.length} incident{all.length === 1 ? "" : "s"}
          </span>
        }
        bodyClassName="p-0"
      >
        {logRows.length === 0 ? (
          <div className="p-5">
            <EmptyState>No audit entries are visible for your current scope.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-ink-faint">
                  <Th>Time</Th>
                  <Th>Incident</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Details</Th>
                  <Th>Request ID</Th>
                  <Th>Hash</Th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((e) => (
                  <LogRow key={`${e.incidentId}-${e.id}`} e={e} incident={world.incidents[e.incidentId]} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
function LogRow({ e, incident }: { e: AuditEntry; incident?: Incident }) {
  return (
    <tr className="border-b border-line/70 last:border-0 hover:bg-slate-50/50">
      <Td className="whitespace-nowrap">
        <div className="font-medium text-ink">{clockTime(e.at)}</div>
        <div className="text-xs text-ink-faint">{relTime(e.at)}</div>
      </Td>
      <Td className="whitespace-nowrap">
        {incident ? (
          <Link href={`/incidents/${e.incidentId}`} className="link">
            {incident.caseNumber}
          </Link>
        ) : (
          <span className="text-ink-faint">{e.incidentId}</span>
        )}
        {incident && (
          <div className="text-xs text-ink-faint">{WORKFLOW_STATE_LABEL[incident.state]}</div>
        )}
      </Td>
      <Td className="whitespace-nowrap">
        <div className="text-ink">{e.actor}</div>
        <div className="text-xs text-ink-faint">{ROLE_LABEL[e.actorRole]}</div>
      </Td>
      <Td className="font-medium text-ink">{capitalize(e.action)}</Td>
      <Td className="max-w-[280px] text-ink-muted">{detailsFor(e)}</Td>
      <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">{e.requestId}</Td>
      <Td className="whitespace-nowrap font-mono text-xs text-ink-faint">
        <span title={e.hash}>{e.hash.slice(0, 10)}…</span>
      </Td>
    </tr>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function capitalize(action: string): string {
  const spaced = action.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function detailsFor(e: AuditEntry): React.ReactNode {
  const parts: string[] = [];
  if (e.reason) parts.push(e.reason);
  if (e.source) parts.push(`source: ${e.source}`);
  if (typeof e.confidence === "number") parts.push(`conf ${pct(e.confidence)}`);
  if (e.providerVersion) parts.push(`v${e.providerVersion}`);
  if (parts.length === 0 && e.after !== undefined && e.after !== null) {
    parts.push(truncate(JSON.stringify(e.after), 60));
  }
  if (parts.length === 0) return <span className="text-ink-faint">—</span>;
  return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ── Small presentational primitives ──────────────────────────────────────────
const STAT_TONE: Record<string, string> = {
  brand: "text-brand",
  red: "text-sev-critical",
  amber: "text-sev-high",
  green: "text-sev-low",
  violet: "text-violet-700",
  slate: "text-ink-faint",
};
function Stat({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "brand" | "red" | "amber" | "green" | "violet" | "slate";
}) {
  return (
    <Card className="p-4">
      <div className={cn("mb-2 flex items-center gap-1.5", STAT_TONE[tone])}>
        {icon}
        <span className="stat-label">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums text-ink">{value}</div>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}
