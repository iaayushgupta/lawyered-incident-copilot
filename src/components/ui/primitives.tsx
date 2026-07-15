import { cn, pct, bucketFor } from "@/lib/utils";
import type { Urgency, WorkflowState, SlaState, Provenance, ReviewStatus } from "@/lib/types";
import { WORKFLOW_STATE_LABEL, PROVENANCE_LABEL } from "@/lib/types";

// ── Cards ──
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  right,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          {typeof title === "string" ? <h2 className="section-title">{title}</h2> : title}
          {right}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

// ── Urgency pill ──
const URGENCY_CLS: Record<Urgency, string> = {
  critical: "bg-sev-criticalBg text-sev-critical",
  high: "bg-sev-highBg text-sev-high",
  medium: "bg-sev-mediumBg text-sev-medium",
  low: "bg-slate-100 text-slate-600",
};
export function UrgencyPill({ urgency }: { urgency: Urgency }) {
  return <span className={cn("pill uppercase", URGENCY_CLS[urgency])}>{urgency}</span>;
}

// ── Confidence pill ──
export function ConfidencePill({ score, label = "Confidence" }: { score: number; label?: string }) {
  const b = bucketFor(score);
  const cls =
    b === "very_high" || b === "high"
      ? "bg-sev-lowBg text-sev-low"
      : b === "medium"
        ? "bg-sev-highBg text-sev-high"
        : "bg-sev-criticalBg text-sev-critical";
  return (
    <span className={cn("pill", cls)} title={`${label}: ${pct(score)} (${b.replace("_", " ")})`}>
      {label} {pct(score)}
    </span>
  );
}

// ── SLA pill ──
const SLA_CLS: Record<SlaState, string> = {
  on_track: "bg-sev-lowBg text-sev-low",
  at_risk: "bg-sev-highBg text-sev-high",
  breached: "bg-sev-criticalBg text-sev-critical",
  met: "bg-slate-100 text-slate-600",
};
const SLA_LABEL: Record<SlaState, string> = {
  on_track: "On track",
  at_risk: "At risk",
  breached: "SLA breached",
  met: "Met",
};
export function SlaPill({ state }: { state: SlaState }) {
  return <span className={cn("pill", SLA_CLS[state])}>{SLA_LABEL[state]}</span>;
}

// ── Workflow state pill ──
const STATE_CLS: Partial<Record<WorkflowState, string>> = {
  resolved: "bg-sev-lowBg text-sev-low",
  closed: "bg-slate-100 text-slate-600",
  abstained: "bg-violet-100 text-violet-700",
  failed: "bg-sev-criticalBg text-sev-critical",
  human_review_required: "bg-amber-100 text-amber-700",
  lawyer_assigned: "bg-blue-100 text-blue-700",
  awaiting_information: "bg-orange-100 text-orange-700",
};
export function StatePill({ state }: { state: WorkflowState }) {
  return (
    <span className={cn("pill", STATE_CLS[state] ?? "bg-slate-100 text-slate-600")}>
      {WORKFLOW_STATE_LABEL[state]}
    </span>
  );
}

// ── Provenance tag ──
const PROV_CLS: Record<Provenance, string> = {
  original_file: "bg-emerald-50 text-emerald-700 border-emerald-200",
  user_statement: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ai_transcript: "bg-amber-50 text-amber-700 border-amber-200",
  ai_translation: "bg-amber-50 text-amber-700 border-amber-200",
  ai_summary: "bg-amber-50 text-amber-700 border-amber-200",
  extracted_fields: "bg-amber-50 text-amber-700 border-amber-200",
  lawyer_reviewed: "bg-blue-50 text-blue-700 border-blue-200",
};
export function ProvenanceTag({ provenance }: { provenance: Provenance }) {
  const isAI = ["ai_transcript", "ai_translation", "ai_summary", "extracted_fields"].includes(provenance);
  return (
    <span className={cn("pill border", PROV_CLS[provenance])} title={isAI ? "Machine-generated output for review. The original record remains authoritative." : undefined}>
      {isAI && "⚙ "}
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

export function ReviewStatusTag({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, string> = {
    unreviewed: "bg-slate-100 text-slate-600",
    verified: "bg-sev-lowBg text-sev-low",
    rejected: "bg-sev-criticalBg text-sev-critical",
    needs_review: "bg-sev-highBg text-sev-high",
  };
  const label: Record<ReviewStatus, string> = {
    unreviewed: "Unreviewed",
    verified: "Verified",
    rejected: "Rejected",
    needs_review: "Needs review",
  };
  return <span className={cn("pill", map[status])}>{label[status]}</span>;
}

// ── Generic tag ──
export function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "red" | "amber" | "green" | "blue" | "violet" }) {
  const map = {
    slate: "bg-slate-100 text-slate-600",
    red: "bg-sev-criticalBg text-sev-critical",
    amber: "bg-sev-highBg text-sev-high",
    green: "bg-sev-lowBg text-sev-low",
    blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return <span className={cn("pill", map[tone])}>{children}</span>;
}

// ── Key/value ──
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="kv-label">{label}</div>
      <div className="kv-value">{children}</div>
    </div>
  );
}

// ── Meter (horizontal bar) ──
export function Meter({ value, tone = "brand" }: { value: number; tone?: "brand" | "green" | "amber" | "red" }) {
  const map = { brand: "bg-brand", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={cn("h-2 rounded-full", map[tone])} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">{children}</div>;
}
