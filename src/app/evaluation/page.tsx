"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import { ArrowRight, ShieldAlert, TrendingUp, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { USERS } from "@/lib/data/master";
import { can } from "@/lib/rbac";
import { evaluateAll, sliceBy, type SliceKey } from "@/lib/evaluation/metrics";
import { DANGEROUS_FAILURE_LABEL, type DangerousFailureType } from "@/lib/evaluation/engine";
import { SYNTHETIC_INCIDENTS } from "@/lib/data/incidents";
import { pct, cn } from "@/lib/utils";
import { SectionCard, Card, Tag, Meter } from "@/components/ui/primitives";

const SLICES: { key: SliceKey; label: string }[] = [
  { key: "incidentCategory", label: "Incident category" },
  { key: "language", label: "Language" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "documentQuality", label: "Document quality" },
  { key: "channel", label: "Input channel" },
  { key: "fraudStatus", label: "Fraud status" },
  { key: "ambiguityLevel", label: "Ambiguity level" },
  { key: "confidenceBucket", label: "Confidence bucket" },
];

export default function EvaluationPage() {
  const currentUserId = useStore((s) => s.currentUserId);
  const user = USERS.find((u) => u.id === currentUserId)!;
  const [slice, setSlice] = useState<SliceKey>("incidentCategory");

  const { cases, metrics } = useMemo(() => evaluateAll(), []);
  const sliceRows = useMemo(() => sliceBy(cases, slice), [cases, slice]);

  if (!can(user.role, "view_evaluation")) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <ShieldAlert className="mx-auto mb-3 text-red-500" size={40} />
        <h2 className="text-lg font-bold text-ink">Access denied</h2>
        <p className="mt-1 text-sm text-ink-muted">Only Legal Ops, Admin, and Auditor roles can view evaluation results.</p>
      </div>
    );
  }

  const calData = metrics.calibration.map((b) => ({
    bucket: b.bucket.replace("_", " "),
    Confidence: Math.round(b.avgConfidence * 100),
    Accuracy: Math.round(b.accuracy * 100),
    count: b.count,
  }));

  const dangerousTotal = Object.values(metrics.dangerousFailureCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Evaluation & Failure Analysis</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Computed from ground truth across {metrics.total} synthetic cases · {metrics.passed} passed ({pct(metrics.passed / metrics.total)}).
          </p>
        </div>
        <Link href="/evaluation/failures" className="btn-ghost">
          <AlertTriangle size={15} /> Failure explorer <ArrowRight size={15} />
        </Link>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Classification accuracy" value={pct(metrics.classificationAccuracy)} good={metrics.classificationAccuracy} />
        <Metric label="Urgency accuracy" value={pct(metrics.urgencyAccuracy)} good={metrics.urgencyAccuracy} />
        <Metric label="Fraud precision / recall" value={`${pct(metrics.fraud.precision)} / ${pct(metrics.fraud.recall)}`} good={metrics.fraud.f1} />
        <Metric label="Contradiction P / R" value={`${pct(metrics.contradiction.precision)} / ${pct(metrics.contradiction.recall)}`} good={metrics.contradiction.f1} />
        <Metric label="Missing-info detection" value={pct(metrics.missingInfoDetection)} good={metrics.missingInfoDetection} />
        <Metric label="Abstention correctness" value={pct(metrics.abstentionCorrectness)} good={metrics.abstentionCorrectness} />
        <Metric label="Escalation recall" value={pct(metrics.escalationRecall)} good={metrics.escalationRecall} />
        <Metric label="Source-grounding rate" value={pct(metrics.sourceGroundingRate)} good={metrics.sourceGroundingRate} />
        <Metric label="Field-extraction reliability" value={pct(metrics.fieldExtractionReliability)} good={metrics.fieldExtractionReliability} />
        <Metric label="Routing top-1 / top-3" value={`${pct(metrics.routingTop1)} / ${pct(metrics.routingTop3)}`} good={metrics.routingTop1} />
        <Metric label="Recommendation acceptance" value={pct(metrics.recommendationAcceptanceRate)} good={metrics.recommendationAcceptanceRate} />
        <Metric label="Lawyer correction rate" value={pct(metrics.lawyerCorrectionRate)} good={1 - metrics.lawyerCorrectionRate} invertGood />
        <Metric label="Calibration error (ECE)" value={metrics.calibrationError.toFixed(3)} good={1 - metrics.calibrationError} />
        <Metric label="Avg confidence" value={pct(metrics.averageConfidence)} good={metrics.averageConfidence} neutral />
        <Metric label="False positive rate" value={pct(metrics.falsePositiveRate)} good={1 - metrics.falsePositiveRate} />
        <Metric label="Unsupported-claim rate" value={pct(metrics.unsupportedClaimRate)} good={1 - metrics.unsupportedClaimRate} />
      </div>

      {/* Dangerous failures */}
      <SectionCard
        title={<div className="flex items-center gap-2"><ShieldAlert size={18} className="text-red-500" /><span className="section-title">Dangerous failures (flagged separately)</span></div>}
        right={<Tag tone={dangerousTotal ? "red" : "green"}>{dangerousTotal} total</Tag>}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {(Object.keys(metrics.dangerousFailureCounts) as DangerousFailureType[]).map((k) => {
            const n = metrics.dangerousFailureCounts[k];
            return (
              <Link
                key={k}
                href={`/evaluation/failures?dangerous=${k}`}
                className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm", n > 0 ? "border-red-200 bg-red-50" : "border-line bg-white")}
              >
                <span className={n > 0 ? "text-red-800" : "text-ink-muted"}>{DANGEROUS_FAILURE_LABEL[k]}</span>
                <span className={cn("font-bold", n > 0 ? "text-red-700" : "text-ink-faint")}>{n}</span>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Dangerous failures are surfaced independently of aggregate accuracy — a single failed critical escalation or
          fabricated source matters even when overall metrics look healthy.
        </p>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calibration */}
        <SectionCard
          title={<div className="flex items-center gap-2"><TrendingUp size={18} className="text-ink-muted" /><span className="section-title">Confidence calibration</span></div>}
          right={<Tag tone="slate">ECE {metrics.calibrationError.toFixed(3)}</Tag>}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#5b6b7f" }} />
                <YAxis tick={{ fontSize: 11, fill: "#5b6b7f" }} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="Confidence" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Accuracy" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Well-calibrated confidence tracks accuracy. Gaps (stated confidence above realized accuracy) indicate
            over-confidence in that bucket.
          </p>
        </SectionCard>

        {/* Slices */}
        <SectionCard
          title="Performance by slice"
          right={
            <select
              aria-label="Slice dimension"
              value={slice}
              onChange={(e) => setSlice(e.target.value as SliceKey)}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand/50"
            >
              {SLICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          }
        >
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {sliceRows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_120px_44px] items-center gap-2 text-sm">
                <span className="truncate capitalize text-ink" title={r.key.replace(/_/g, " ")}>{r.key.replace(/_/g, " ")}</span>
                <Meter value={r.passRate} tone={r.passRate > 0.8 ? "green" : r.passRate > 0.55 ? "amber" : "red"} />
                <span className="text-right text-xs text-ink-muted">{pct(r.passRate)}</span>
                <span className="col-span-3 -mt-1 text-[11px] text-ink-faint">n={r.count} · classification {pct(r.classificationAccuracy)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <StatBlock label="Time saved (simulated)" value={`${Math.round(metrics.timeSavedMinutes / 60)} h`} sub={`~22 min/auto-triaged case across ${metrics.total} cases`} />
        <StatBlock label="Median time to human escalation" value={`${metrics.avgTimeToEscalationMin} min`} sub="Simulated first-escalation latency" />
        <StatBlock label="Dataset difficulty mix" value={`${SYNTHETIC_INCIDENTS.filter((s) => s.evaluation.difficulty === "adversarial").length} adversarial`} sub={`${SYNTHETIC_INCIDENTS.length} cases total`} />
      </div>
    </div>
  );
}

function Metric({ label, value, good, neutral, invertGood }: { label: string; value: string; good: number; neutral?: boolean; invertGood?: boolean }) {
  const tone = neutral ? "text-ink" : good >= 0.85 ? "text-emerald-600" : good >= 0.65 ? "text-amber-600" : "text-red-600";
  return (
    <Card className="p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 text-xl font-bold", tone)}>{value}</div>
    </Card>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{sub}</div>
    </Card>
  );
}

// silence unused imports used conditionally by recharts typings
void Cell;
void LabelList;
