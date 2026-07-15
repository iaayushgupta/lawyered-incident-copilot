"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Demo Mode — a guided, resettable walkthrough over curated synthetic cases.
//
// For each of six scenarios we resolve a concrete incident from the in-memory
// world (by predicate, with a hard-coded fallback), then render the run as a
// step-by-step pass through the pipeline components, a ground-truth vs actual
// comparison, and a PASS/FAIL verdict from the evaluation engine.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PlayCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Cpu,
  FileText,
  Scale,
  Ban,
  ShieldAlert,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { getSyntheticById } from "@/lib/data/incidents";
import { evaluateCase } from "@/lib/evaluation/engine";
import { INCIDENT_TYPE_LABEL } from "@/lib/types";
import type { Incident, IncidentType, Urgency } from "@/lib/types";
import { vehicleReg, driverName } from "@/lib/view";
import { pct, cn } from "@/lib/utils";
import {
  SectionCard,
  Card,
  KV,
  Tag,
  ConfidencePill,
  UrgencyPill,
  StatePill,
  EmptyState,
} from "@/components/ui/primitives";

// ── Scenario definitions ────────────────────────────────────────────────────

const FRAUD_FINDINGS = [
  "altered_content",
  "fake_logo",
  "forged_signature",
  "altered_date",
  "duplicate_document",
];

interface ScenarioDef {
  key: string;
  label: string;
  blurb: string;
  predicate: (i: Incident) => boolean;
  fallbackId: string;
}

const SCENARIOS: ScenarioDef[] = [
  {
    key: "normal",
    label: "Normal permit issue with sufficient documents",
    blurb: "Happy path: a well-evidenced permit case the system can safely act on.",
    predicate: (i) =>
      i.triage?.incidentType === "permit_issue" &&
      !i.suspectedFraud &&
      (i.triage?.contradictions?.length ?? 0) === 0 &&
      i.documents.length > 0 &&
      !i.triage?.shouldAbstain,
    fallbackId: "SIG-A-01",
  },
  {
    key: "incomplete",
    label: "Incomplete incident requiring follow-up",
    blurb: "Missing required fields — the system asks clarifying questions instead of guessing.",
    predicate: (i) =>
      Boolean(
        (i.understanding?.missingRequiredFields?.length ?? 0) ||
          (i.understanding?.followUpQuestions?.length ?? 0),
      ) &&
      !i.actionPlan?.abstained &&
      !i.suspectedFraud,
    fallbackId: "SIG-A-08",
  },
  {
    key: "contradictory",
    label: "Contradictory permit and notice",
    blurb: "Conflicting evidence across documents — the contradiction detector must flag it.",
    predicate: (i) =>
      (i.triage?.contradictions?.length ?? 0) > 0 &&
      i.triage?.incidentType === "permit_issue",
    fallbackId: "SIG-A-01",
  },
  {
    key: "fraud",
    label: "Fraudulent or altered document",
    blurb: "Document-integrity signals — the fraud aggregator must route to review.",
    predicate: (i) =>
      i.suspectedFraud &&
      i.documents.some((d) => d.findings.some((f) => FRAUD_FINDINGS.includes(f))),
    fallbackId: "SIG-A-07",
  },
  {
    key: "abstain",
    label: "Low-confidence multilingual incident requiring abstention",
    blurb: "Non-English, low confidence — the confidence gate should abstain and defer to a human.",
    predicate: (i) => Boolean(i.triage?.shouldAbstain) && i.originalLanguage !== "en",
    fallbackId: "SIG-B-12",
  },
  {
    key: "critical",
    label: "Critical incident requiring immediate lawyer escalation",
    blurb: "Critical urgency — the escalation gate must force an immediate human handoff.",
    predicate: (i) => i.urgency === "critical" && Boolean(i.triage?.requiresHumanEscalation),
    fallbackId: "SIG-C-01",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const world = useStore((s) => s.world);
  const resetIncident = useStore((s) => s.resetIncident);
  const pushToast = useStore((s) => s.pushToast);

  const [selected, setSelected] = useState(0);

  // Resolve each scenario to a concrete incident id once, per world snapshot.
  const resolvedIds = useMemo(() => {
    const all = world.order.map((id) => world.incidents[id]).filter(Boolean);
    return SCENARIOS.map((sc) => {
      const match = all.find((i) => {
        try {
          return sc.predicate(i);
        } catch {
          return false;
        }
      });
      return match?.id ?? sc.fallbackId;
    });
  }, [world]);

  const active = SCENARIOS[selected];
  const activeId = resolvedIds[selected];
  const inc = world.incidents[activeId];

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <PlayCircle size={22} className="text-brand" />
          <h1 className="text-[26px] font-bold text-ink">Demo Mode</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Guided, resettable walkthroughs over curated synthetic cases. Each scenario shows the raw
          input, steps through the workflow component-by-component, then compares the system&apos;s
          output against explicit ground truth to reveal whether it passed or failed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Scenario chips */}
        <nav aria-label="Demo scenarios" className="space-y-2">
          {SCENARIOS.map((sc, idx) => {
            const isActive = idx === selected;
            return (
              <button
                key={sc.key}
                onClick={() => setSelected(idx)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                  isActive
                    ? "border-brand bg-brand/10 shadow-card"
                    : "border-line bg-white hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                    isActive ? "bg-brand text-white" : "bg-slate-100 text-ink-muted",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-semibold leading-snug",
                      isActive ? "text-brand" : "text-ink",
                    )}
                  >
                    {sc.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">{sc.blurb}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Selected scenario run */}
        <div className="min-w-0">
          {inc ? (
            <ScenarioRun key={inc.id} inc={inc} label={active.label} resetIncident={resetIncident} pushToast={pushToast} />
          ) : (
            <SectionCard title={active.label}>
              <EmptyState>
                No incident could be resolved for this scenario (looked for id{" "}
                <code className="font-mono">{activeId}</code>). It may not be present in the current
                dataset.
              </EmptyState>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scenario run ─────────────────────────────────────────────────────────────

function ScenarioRun({
  inc,
  label,
  resetIncident,
  pushToast,
}: {
  inc: Incident;
  label: string;
  resetIncident: (id: string) => void;
  pushToast: (kind: "info" | "success" | "warn" | "error", message: string) => void;
}) {
  const synthetic = getSyntheticById(inc.syntheticId);
  const evaluation = synthetic ? evaluateCase(synthetic) : undefined;
  const expected = synthetic?.expected;

  const steps = buildSteps(inc);

  return (
    <div className="space-y-5">
      {/* Verdict banner */}
      {evaluation && (
        <VerdictBanner evaluation={evaluation} />
      )}

      {/* Input */}
      <SectionCard
        title="Input"
        right={<StatePill state={inc.state} />}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KV label="Channel">
              <span className="capitalize">{inc.channel.replace(/_/g, " ")}</span>
            </KV>
            <KV label="Language">
              {inc.originalLanguage === "en" ? "English" : inc.originalLanguage}
            </KV>
            <KV label="Vehicle">{vehicleReg(inc)}</KV>
            <KV label="Driver">{driverName(inc.driverId)}</KV>
          </div>
          <div>
            <div className="kv-label mb-1">Raw message</div>
            <blockquote className="rounded-lg border border-line bg-slate-50/70 px-4 py-3 text-sm italic text-ink">
              {inc.rawInput?.trim() ? `“${inc.rawInput}”` : <span className="not-italic text-ink-faint">(empty message)</span>}
            </blockquote>
          </div>
        </div>
      </SectionCard>

      {/* Workflow steps */}
      <SectionCard title="Workflow" bodyClassName="space-y-3">
        {steps.map((step, i) => (
          <WorkflowStep key={step.title} n={i + 1} step={step} />
        ))}
      </SectionCard>

      {/* Ground truth vs actual */}
      <SectionCard title="Ground truth vs actual system output">
        {expected ? (
          <ComparisonTable inc={inc} expected={expected} />
        ) : (
          <EmptyState>No ground-truth record found for this synthetic case.</EmptyState>
        )}
      </SectionCard>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => {
            resetIncident(inc.id);
            pushToast("info", `Reset scenario “${label}”.`);
          }}
          className="btn-ghost inline-flex items-center gap-2"
        >
          <RotateCcw size={15} />
          Reset scenario
        </button>
        <Link href={`/incidents/${inc.id}`} className="link inline-flex items-center gap-1 text-sm">
          Open full case
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ── Verdict banner ───────────────────────────────────────────────────────────

function VerdictBanner({ evaluation }: { evaluation: ReturnType<typeof evaluateCase> }) {
  if (evaluation.passed) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-sev-lowBg px-5 py-4">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-sev-low" />
        <div>
          <div className="text-sm font-bold text-sev-low">
            System PASSED — output matched ground truth
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            All core checks agreed with ground truth and no dangerous failure was detected.
            System confidence {pct(evaluation.confidence)}.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-red-200 bg-sev-criticalBg px-5 py-4">
      <div className="flex items-start gap-3">
        <XCircle size={22} className="mt-0.5 shrink-0 text-sev-critical" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-sev-critical">
            System FAILED — {evaluation.failureType ?? "Unknown failure"}
          </div>
          <dl className="mt-2 space-y-1.5 text-xs text-ink-muted">
            {evaluation.likelyReason && (
              <Detail term="Likely reason" desc={evaluation.likelyReason} />
            )}
            {evaluation.affectedComponent && (
              <Detail term="Affected component" desc={evaluation.affectedComponent} />
            )}
            {evaluation.recommendedImprovement && (
              <Detail term="Recommended improvement" desc={evaluation.recommendedImprovement} />
            )}
          </dl>
          {evaluation.dangerousFailures.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ShieldAlert size={14} className="text-sev-critical" />
              {evaluation.dangerousFailures.map((f) => (
                <Tag key={f} tone="red">
                  {f.replace(/_/g, " ")}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="font-semibold text-ink">{term}:</dt>
      <dd>{desc}</dd>
    </div>
  );
}

// ── Workflow steps ───────────────────────────────────────────────────────────

type StepIcon = "cpu" | "file" | "scale" | "ban";

interface Step {
  component: string;
  title: string;
  icon: StepIcon;
  lines: string[];
  tone?: "default" | "amber" | "red" | "violet";
}

function iconFor(icon: StepIcon) {
  const props = { size: 16, className: "text-brand" as const };
  switch (icon) {
    case "file":
      return <FileText {...props} />;
    case "scale":
      return <Scale {...props} />;
    case "ban":
      return <Ban {...props} />;
    case "cpu":
    default:
      return <Cpu {...props} />;
  }
}

function WorkflowStep({ n, step }: { n: number; step: Step }) {
  return (
    <Card className="flex gap-3 border-line p-4">
      <div className="flex flex-col items-center">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">
          {n}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {iconFor(step.icon)}
          <span className="text-sm font-semibold text-ink">{step.component}</span>
          <span className="text-xs text-ink-faint">· {step.title}</span>
        </div>
        <ul className="mt-2 space-y-1">
          {step.lines.map((l, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function buildSteps(inc: Incident): Step[] {
  const steps: Step[] = [];
  const u = inc.understanding;
  const t = inc.triage;
  const plan = inc.actionPlan;

  // 1. Incident Understanding
  const understandingLines: string[] = [];
  if (u) {
    understandingLines.push(
      `Detected language: ${u.detectedLanguage}${
        u.translatedText ? " → translated to English" : ""
      }.`,
    );
    if (u.translatedText) understandingLines.push(`Translation: “${u.translatedText}”`);
    if (u.missingRequiredFields.length)
      understandingLines.push(
        `Missing required fields: ${u.missingRequiredFields.join(", ")}.`,
      );
    if (u.followUpQuestions.length)
      understandingLines.push(
        `Follow-up questions raised (${u.followUpQuestions.length}): ${u.followUpQuestions[0]}`,
      );
    if (!u.missingRequiredFields.length && !u.followUpQuestions.length)
      understandingLines.push("All required fields present; no follow-up needed.");
  } else {
    understandingLines.push("No intake understanding recorded for this case.");
  }
  steps.push({
    component: "Incident Understanding",
    title: "Intake, language detection & required-field check",
    icon: "cpu",
    lines: understandingLines,
  });

  // 2. Document Intelligence
  const docLines: string[] = [];
  if (inc.documents.length) {
    for (const d of inc.documents) {
      const findings = d.findings.length
        ? d.findings.map((f) => f.replace(/_/g, " ")).join(", ")
        : "no adverse findings";
      docLines.push(
        `${d.source.filename} → classified as ${d.classification.replace(/_/g, " ")} (${findings})${
          d.requiresHumanValidation ? " · needs human validation" : ""
        }.`,
      );
    }
  } else {
    docLines.push("No documents attached to this incident.");
  }
  steps.push({
    component: "Document Intelligence",
    title: "Classification & integrity findings",
    icon: "file",
    lines: docLines,
  });

  // 3. Triage Engine
  const triageLines: string[] = [];
  if (t) {
    triageLines.push(
      `Type: ${INCIDENT_TYPE_LABEL[t.incidentType]} · urgency: ${t.urgency} · confidence ${pct(
        t.confidence,
      )}.`,
    );
    triageLines.push(
      `Suspected fraud: ${t.suspectedFraud ? "yes" : "no"} · contradictions: ${
        t.contradictions.length
      }.`,
    );
    if (t.contradictions.length)
      triageLines.push(`Contradiction: ${t.contradictions[0]}`);
    triageLines.push(
      `Should abstain: ${t.shouldAbstain ? "yes" : "no"} · requires human escalation: ${
        t.requiresHumanEscalation ? "yes" : "no"
      }.`,
    );
  } else {
    triageLines.push("Triage did not produce a result for this case.");
  }
  steps.push({
    component: "Triage Engine",
    title: "Classification, urgency, fraud & contradiction analysis",
    icon: "cpu",
    lines: triageLines,
  });

  // 4. Legal Retrieval
  const retrievalLines: string[] = [];
  const planSources = plan?.sourceIds ?? [];
  if (plan?.abstained) {
    retrievalLines.push("Retrieval deferred — the system abstained before grounding a plan.");
  } else if (planSources.length) {
    retrievalLines.push(`Grounded against ${planSources.length} legal source(s): ${planSources.join(", ")}.`);
  } else {
    retrievalLines.push("No legal sources were attached.");
  }
  steps.push({
    component: "Legal Retrieval",
    title: "Grounding against the synthetic legal corpus",
    icon: "scale",
    lines: retrievalLines,
  });

  // 5. Recommendation + Guardrails
  const recLines: string[] = [];
  if (plan) {
    if (plan.abstained) {
      recLines.push(
        `Abstained — ${plan.abstentionReason ?? "no reliable recommendation"}. No action plan generated.`,
      );
    } else {
      const withSources = plan.steps.filter((s) => (s.sourceIds?.length ?? 0) > 0).length;
      recLines.push(
        `Produced an action plan with ${plan.steps.length} step(s); ${withSources} linked to a source.`,
      );
      if (plan.steps[0]) recLines.push(`First step: ${plan.steps[0].title}`);
    }
  } else {
    recLines.push("No action plan produced.");
  }
  steps.push({
    component: "Recommendation + Guardrails",
    title: "Action-plan generation with source-grounding guardrails",
    icon: plan?.abstained ? "ban" : "cpu",
    lines: recLines,
  });

  // 6. Human-review gate
  const gateLines: string[] = [];
  const needsApproval = plan?.requiresHumanApproval ?? true;
  gateLines.push(
    needsApproval
      ? "Human approval required before any action is taken."
      : "No human approval required for this low-risk case.",
  );
  if (t?.requiresHumanEscalation)
    gateLines.push("Flagged for immediate lawyer escalation.");
  if (inc.documents.some((d) => d.requiresHumanValidation))
    gateLines.push("One or more documents require human validation.");
  steps.push({
    component: "Human-review gate",
    title: "Approval & escalation control",
    icon: "cpu",
    lines: gateLines,
  });

  return steps;
}

// ── Comparison table ─────────────────────────────────────────────────────────

type ExpectedShape = NonNullable<ReturnType<typeof getSyntheticById>>["expected"];

function ComparisonTable({ inc, expected }: { inc: Incident; expected: ExpectedShape }) {
  const t = inc.triage;
  const actualType: IncidentType | undefined = t?.incidentType;
  const actualUrgency: Urgency = t?.urgency ?? inc.urgency;
  const actualFraud = t?.suspectedFraud ?? inc.suspectedFraud;
  const actualEscalation = t?.requiresHumanEscalation ?? false;
  const actualAbstain = t?.shouldAbstain ?? false;
  const actualContradiction = (t?.contradictions?.length ?? 0) > 0;

  const rows: { label: string; expected: string; actual: string; match: boolean }[] = [
    {
      label: "Incident type",
      expected: INCIDENT_TYPE_LABEL[expected.incidentType],
      actual: actualType ? INCIDENT_TYPE_LABEL[actualType] : "—",
      match: actualType === expected.incidentType,
    },
    {
      label: "Urgency",
      expected: expected.urgency,
      actual: actualUrgency,
      match: actualUrgency === expected.urgency,
    },
    {
      label: "Suspected fraud",
      expected: yn(expected.suspectedFraud),
      actual: yn(actualFraud),
      match: actualFraud === expected.suspectedFraud,
    },
    {
      label: "Requires escalation",
      expected: yn(expected.requiresHumanEscalation),
      actual: yn(actualEscalation),
      match: actualEscalation === expected.requiresHumanEscalation,
    },
    {
      label: "Should abstain",
      expected: yn(expected.shouldAbstain),
      actual: yn(actualAbstain),
      match: actualAbstain === expected.shouldAbstain,
    },
    {
      label: "Contradictions",
      expected: yn(expected.contradictions.length > 0),
      actual: yn(actualContradiction),
      match: (expected.contradictions.length > 0) === actualContradiction,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="px-3 py-2 font-semibold">Check</th>
            <th className="px-3 py-2 font-semibold">Ground truth</th>
            <th className="px-3 py-2 font-semibold">Actual output</th>
            <th className="px-3 py-2 text-right font-semibold">Match</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line/70 last:border-0">
              <td className="px-3 py-2.5 font-medium text-ink">{r.label}</td>
              <td className="px-3 py-2.5 capitalize text-ink-muted">{r.expected}</td>
              <td className={cn("px-3 py-2.5 capitalize", r.match ? "text-ink-muted" : "font-semibold text-sev-critical")}>
                {r.actual}
              </td>
              <td className="px-3 py-2.5 text-right">
                {r.match ? (
                  <CheckCircle2 size={17} className="ml-auto text-sev-low" aria-label="match" />
                ) : (
                  <XCircle size={17} className="ml-auto text-sev-critical" aria-label="mismatch" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ConfidencePill score={inc.confidence} />
        <UrgencyPill urgency={inc.urgency} />
        {inc.suspectedFraud && <Tag tone="red">Suspected fraud</Tag>}
      </div>
    </div>
  );
}

function yn(v: boolean): string {
  return v ? "Yes" : "No";
}
