"use client";

import { useState } from "react";
import {
  ShieldAlert, FileText, Languages, HelpCircle, AlertTriangle, CheckCircle2, XCircle,
  Ban, Scale, Clock, Fingerprint, Link2, Bot, User, Sparkles,
} from "lucide-react";
import type { Incident } from "@/lib/types";
import {
  INCIDENT_TYPE_LABEL, DOCUMENT_TYPE_LABEL, DOC_FINDING_LABEL, ABSTENTION_LABEL, PROVENANCE_LABEL,
} from "@/lib/types";
import { useStore } from "@/lib/store";
import { LEGAL_SOURCES, getSourceById } from "@/lib/data/sources";
import { LAWYERS, USERS } from "@/lib/data/master";
import { can } from "@/lib/rbac";
import { applyPii } from "@/lib/pii";
import { inrFull, pct, cn, clockTime } from "@/lib/utils";
import {
  SectionCard, KV, ConfidencePill, ProvenanceTag, ReviewStatusTag, Tag, Meter, UrgencyPill, EmptyState,
} from "@/components/ui/primitives";

function useUser() {
  const id = useStore((s) => s.currentUserId);
  return USERS.find((u) => u.id === id)!;
}

// ─────────────────────────── Intake & Triage ───────────────────────────
export function IntakePanel({ incident }: { incident: Incident }) {
  const user = useUser();
  const u = incident.understanding;
  const t = incident.triage;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      {/* Conversation / original input */}
      <div className="space-y-5">
        <SectionCard
          title="Driver conversation"
          right={<Tag tone="blue">{channelLabel(incident.channel)}</Tag>}
        >
          <div className="space-y-3">
            <div className="rounded-xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-ink">
              “{applyPii(incident.rawInput || "(empty message)", user.role)}”
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
                <ProvenanceTag provenance="user_statement" />
                <span>Original input — preserved, never overwritten</span>
              </div>
            </div>
            {u?.detectedLanguage && u.detectedLanguage !== "en" && u.translatedText && (
              <div className="rounded-xl rounded-tl-sm border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-ink">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-700">
                  <Languages size={13} /> AI transcript · translated from {u.detectedLanguage.toUpperCase()}
                  {u.translationChangedMeaning && <Tag tone="red">translation may change meaning</Tag>}
                </div>
                {applyPii(u.translatedText, user.role)}
                <div className="mt-2"><ProvenanceTag provenance="ai_translation" /></div>
              </div>
            )}
          </div>

          {/* Extracted fields */}
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Extracted fields (per-field confidence)</div>
            {u && u.fields.length > 0 ? (
              <div className="space-y-2">
                {u.fields.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <div>
                      <span className="text-ink-muted">{f.label}: </span>
                      <span className="font-medium text-ink">{String(f.value)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReviewStatusTag status={f.reviewStatus} />
                      <ConfidencePill score={f.confidence} label="" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No structured fields extracted from this input.</EmptyState>
            )}
          </div>

          {/* Missing / ambiguity / follow-ups */}
          {u && (u.missingRequiredFields.length > 0 || u.ambiguityWarnings.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {u.missingRequiredFields.length > 0 && (
                <InfoBox tone="amber" icon={HelpCircle} title="Missing required fields">
                  {u.missingRequiredFields.map((m) => <li key={m}>{m.replace(/_/g, " ")}</li>)}
                </InfoBox>
              )}
              {u.ambiguityWarnings.length > 0 && (
                <InfoBox tone="amber" icon={AlertTriangle} title="Ambiguity warnings">
                  {u.ambiguityWarnings.map((m, idx) => <li key={idx}>{m}</li>)}
                </InfoBox>
              )}
            </div>
          )}
          {u && u.followUpQuestions.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">System requests only missing evidence</div>
              <ul className="space-y-1.5 text-sm text-ink">
                {u.followUpQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{q}</li>
                ))}
              </ul>
            </div>
          )}
          {u?.possibleMultipleIncidents && (
            <div className="mt-4"><Tag tone="amber">⚠ Possible multiple incidents in one conversation</Tag></div>
          )}
        </SectionCard>
      </div>

      {/* Triage panel */}
      <div className="space-y-5">
        {t && (
          <SectionCard
            title="AI triage"
            right={<ConfidencePill score={t.confidence} />}
          >
            <div className="grid grid-cols-2 gap-4">
              <KV label="Incident">{INCIDENT_TYPE_LABEL[t.incidentType]}</KV>
              <KV label="Urgency"><UrgencyPill urgency={t.urgency} /></KV>
              <KV label="Jurisdiction">{incident.jurisdiction ?? "Undetermined"}</KV>
              <KV label="Likely issue">{t.subcategory ?? "—"}</KV>
              <KV label="Vehicle impact">{t.immobilized ? "Immobilized" : "Operational"}</KV>
              <KV label="Business exposure">{inrFull(t.financialRiskPerDay)} / day</KV>
              <KV label="Legal risk"><span className="capitalize">{t.legalRiskLevel}</span></KV>
              <KV label="Driver safety"><span className="capitalize">{t.driverSafetyRisk}</span></KV>
            </div>

            {t.contradictions.length > 0 && (
              <div className="mt-4">
                <InfoBox tone="red" icon={AlertTriangle} title="Contradictions detected">
                  {t.contradictions.map((c, i) => <li key={i}>{c}</li>)}
                </InfoBox>
              </div>
            )}
            {t.suspectedFraud && (
              <div className="mt-3">
                <InfoBox tone="red" icon={ShieldAlert} title="Suspected fraud — human review required">
                  {t.fraudSignals.length ? t.fraudSignals.map((s, i) => <li key={i}>{s}</li>) : <li>Fraud pattern flagged.</li>}
                </InfoBox>
              </div>
            )}
            {t.requiresHumanEscalation && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Scale size={15} /> Immediate human escalation: {t.escalationReason}
              </div>
            )}
            {t.shouldAbstain && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
                <Ban size={15} /> System abstains — {t.abstainReason}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Documents ───────────────────────────
export function DocumentsPanel({ incident }: { incident: Incident }) {
  const user = useUser();
  const verifyField = useStore((s) => s.verifyField);
  const canVerify = can(user.role, "approve_action_plan") || can(user.role, "reclassify_incident");

  if (incident.documents.length === 0) return <EmptyState>No documents uploaded for this incident yet.</EmptyState>;

  return (
    <div className="space-y-5">
      {incident.documents.map((d) => (
        <SectionCard
          key={d.id}
          title={
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-ink-muted" />
              <span className="section-title">{DOCUMENT_TYPE_LABEL[d.classification]}</span>
              {d.classification !== d.source.claimedType && <Tag tone="amber">claimed: {DOCUMENT_TYPE_LABEL[d.source.claimedType]}</Tag>}
            </div>
          }
          right={<ConfidencePill score={d.classificationConfidence} label="Classify" />}
        >
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Original representation */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Original document</div>
              <div className="rounded-lg border border-line bg-slate-50 p-4 font-mono text-xs text-ink">
                {d.source.originalPreview}
                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
                  <ProvenanceTag provenance="original_file" />
                  <span>{d.source.filename}</span>
                </div>
              </div>
              {d.source.embeddedInstruction && (
                <InfoBox tone="red" icon={ShieldAlert} title="Embedded instruction detected — surfaced, NOT executed" className="mt-3">
                  <li className="font-mono text-[11px]">“{d.source.embeddedInstruction}”</li>
                  <li className="mt-1 not-italic">The system treats document content as data, never as instructions.</li>
                </InfoBox>
              )}
            </div>

            {/* Extracted structured info */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Extracted information</div>
                <span className="text-[11px] text-ink-faint">Expiry: <span className={cn("font-semibold", d.expiryStatus === "expired" ? "text-red-600" : d.expiryStatus === "appears_expired_but_valid" ? "text-amber-600" : "text-emerald-600")}>{d.expiryStatus.replace(/_/g, " ")}</span></span>
              </div>
              <div className="space-y-2">
                {d.extractedFields.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                    <div><span className="text-ink-muted">{f.label}: </span><span className="font-medium">{String(f.value)}</span></div>
                    <div className="flex items-center gap-1.5">
                      <ConfidencePill score={f.confidence} label="" />
                      {canVerify && f.reviewStatus !== "verified" ? (
                        <button onClick={() => verifyField(incident.id, d.id, f.key)} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Verify</button>
                      ) : (
                        <ReviewStatusTag status={f.reviewStatus} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Findings */}
          {d.findings.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {d.findings.map((f) => (
                <Tag key={f} tone={["expired", "altered_content", "vehicle_number_mismatch", "owner_mismatch", "forged_signature", "fake_logo", "embedded_instruction", "duplicate_document"].includes(f) ? "red" : f === "appears_expired_but_valid" ? "green" : "amber"}>
                  {DOC_FINDING_LABEL[f]}
                </Tag>
              ))}
            </div>
          )}
          {d.requiresHumanValidation && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle size={15} /> Human validation required before this document can be relied upon.
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

// ─────────────────────────── Evidence ───────────────────────────
export function EvidencePanel({ incident }: { incident: Incident }) {
  const user = useUser();
  return (
    <SectionCard title="Evidence & record preservation" right={<Tag tone="slate">{incident.evidence.length} records</Tag>}>
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        Machine-generated output for review. The original record remains authoritative. Uploaded messages/audio are
        treated as <span className="font-semibold">potentially relevant electronic records</span>, not automatically admissible evidence.
      </div>
      <div className="space-y-3">
        {incident.evidence.map((e) => {
          const isAI = ["ai_transcript", "ai_translation", "ai_summary", "extracted_fields"].includes(e.provenance);
          return (
            <div key={e.id} className="rounded-lg border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isAI ? <Bot size={16} className="text-amber-600" /> : <User size={16} className="text-emerald-600" />}
                  <span className="font-semibold text-ink">{e.label}</span>
                  <ProvenanceTag provenance={e.provenance} />
                </div>
                <div className="flex items-center gap-1 text-[11px] text-ink-faint">
                  <Fingerprint size={12} /> {e.fileHash}
                </div>
              </div>
              <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm text-ink">{applyPii(e.content, user.role)}</div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-3">
                <span>Uploaded: {clockTime(e.uploadedAt)}</span>
                <span>By: {e.uploadedBy}</span>
                <span>Channel: {channelLabel(e.sourceChannel)}</span>
                <span>Device: {e.deviceMetadata}</span>
                <span>Full conversation: {e.fullConversationPreserved ? "preserved" : "partial"}</span>
                <span className={e.contextMayBeMissing ? "text-amber-600" : ""}>Context: {e.contextMayBeMissing ? "may be missing" : "complete"}</span>
              </div>
              {e.transformationHistory.length > 0 && (
                <div className="mt-2 text-xs text-ink-faint">Transformations: {e.transformationHistory.join(" → ")}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-ink-faint">
                <Clock size={11} /> Chain of custody:
                {e.chainOfCustody.map((c, i) => (
                  <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5">{c.actor}: {c.event}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─────────────────────────── Action Plan ───────────────────────────
export function ActionPlanPanel({ incident }: { incident: Incident }) {
  const user = useUser();
  const plan = incident.actionPlan;
  const lawyerDecision = useStore((s) => s.lawyerDecision);
  const markUnsupported = useStore((s) => s.markStepUnsupported);
  const pushToast = useStore((s) => s.pushToast);
  const [note, setNote] = useState("");
  const canApprove = can(user.role, "approve_action_plan");

  if (!plan) return <EmptyState>Action plan not yet generated. Advance the workflow through triage and retrieval.</EmptyState>;

  if (plan.abstained) {
    return (
      <SectionCard title="Grounded action plan" right={<Tag tone="violet">ABSTAINED</Tag>}>
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-violet-800">
            <Ban size={16} /> System abstained: {plan.abstentionReason && ABSTENTION_LABEL[plan.abstentionReason]}
          </div>
          <p className="mt-2 text-sm text-violet-900">
            The copilot did not produce a recommendation. This case is deferred to a human, as designed. Uncertainty is
            surfaced rather than hidden.
          </p>
        </div>
        {plan.documentsToCollect.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Documents to collect</div>
            <ul className="list-inside list-disc text-sm text-ink">{plan.documentsToCollect.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        )}
        <ProhibitedBox items={plan.prohibitedActions} />
        <Disclaimer text={plan.disclaimer} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Grounded action plan"
        right={<div className="flex items-center gap-2"><Tag tone="amber">DRAFT · NOT LEGAL ADVICE</Tag><ConfidencePill score={plan.confidence} /></div>}
      >
        {/* Driver instructions */}
        <PlanList title="Immediate driver instructions" items={plan.driverInstructions} />
        {/* Steps with sources */}
        <div className="mt-5 space-y-3">
          {plan.steps.map((s) => (
            <div key={s.id} className={cn("rounded-lg border p-4", s.markedUnsupported ? "border-red-200 bg-red-50/40" : "border-line")}>
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{s.order}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{s.title}</span>
                    <ConfidencePill score={s.confidence} label="" />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">{s.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {s.sourceIds.length > 0 ? (
                      s.sourceIds.map((id) => {
                        const src = getSourceById(id);
                        return (
                          <span key={id} className={cn("pill border", src ? "border-teal/30 bg-teal/10 text-teal" : "border-red-300 bg-red-50 text-red-700")} title={src?.summary ?? "Source not found in corpus"}>
                            <Link2 size={11} /> {src ? src.citation : `⚠ ${id} (not in corpus)`}
                          </span>
                        );
                      })
                    ) : (
                      <span className="pill border border-red-300 bg-red-50 text-red-700"><AlertTriangle size={11} /> No source — unsupported</span>
                    )}
                    {s.markedUnsupported && <Tag tone="red">Marked unsupported</Tag>}
                  </div>
                  {s.assumptions.length > 0 && (
                    <div className="mt-2 text-xs text-ink-faint">Assumptions: {s.assumptions.join("; ")}</div>
                  )}
                  {canApprove && !s.markedUnsupported && (
                    <button onClick={() => markUnsupported(incident.id, s.id)} className="mt-2 text-xs font-semibold text-red-600 hover:underline">
                      Mark this AI statement as unsupported
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {plan.unresolvedContradictions.length > 0 && (
          <div className="mt-4"><InfoBox tone="red" icon={AlertTriangle} title="Unresolved contradictions">{plan.unresolvedContradictions.map((c, i) => <li key={i}>{c}</li>)}</InfoBox></div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PlanList title="Documents to collect" items={plan.documentsToCollect} compact />
          <PlanList title="Legal questions to verify" items={plan.legalQuestionsToVerify} compact />
        </div>

        {/* Sources attached */}
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Sources attached to this plan</div>
          <div className="flex flex-wrap gap-2">
            {plan.sourceIds.length ? plan.sourceIds.map((id) => {
              const src = getSourceById(id);
              return <Tag key={id} tone={src ? "green" : "red"}>{src ? src.title : `⚠ ${id} (fabricated)`}</Tag>;
            }) : <Tag tone="red">No sources — recommendation unsupported</Tag>}
          </div>
        </div>

        <ProhibitedBox items={plan.prohibitedActions} />
        <Disclaimer text={plan.disclaimer} />
      </SectionCard>

      {/* Approval gate */}
      <SectionCard title="Human review (high-risk gate)">
        {plan.requiresHumanApproval && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Scale size={15} /> High-risk legal actions require lawyer approval before execution.
          </div>
        )}
        {canApprove ? (
          <>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional lawyer note (recorded in audit log)…" className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand/50" rows={2} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => { lawyerDecision(incident.id, "approved", note || "Plan approved."); pushToast("success", "Action plan approved by lawyer."); }}>
                <CheckCircle2 size={16} /> Approve plan
              </button>
              <button className="btn-ghost" onClick={() => { lawyerDecision(incident.id, "edited", note || "Plan edited."); pushToast("info", "Marked as edited."); }}>Edit draft</button>
              <button className="btn-ghost" onClick={() => { lawyerDecision(incident.id, "requested_more_documents", note || "Requested more documents."); pushToast("info", "Requested more documents."); }}>Request documents</button>
              <button className="btn-danger" onClick={() => { lawyerDecision(incident.id, "rejected", note || "Plan rejected."); pushToast("warn", "Action plan rejected."); }}>
                <XCircle size={16} /> Reject
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            Your role ({user.role.replace(/_/g, " ")}) cannot approve high-risk actions. Switch to a Lawyer or Admin role to review.
          </div>
        )}
        {incident.reviews.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-line pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Review history</div>
            {incident.reviews.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm text-ink-muted">
                <Sparkles size={13} className="text-teal" /> {LAWYERS.find((l) => l.id === r.lawyerId)?.name ?? r.lawyerId} · <span className="font-medium capitalize">{r.decision.replace(/_/g, " ")}</span> · {clockTime(r.at)}
                {r.note && <span className="text-ink-faint">— {r.note}</span>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────── Small building blocks ───────────────────────
function PlanList({ title, items, compact }: { title: string; items: string[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</div>
      <ul className={cn("space-y-1 text-sm text-ink", compact && "text-[13px]")}>
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{it}</li>
        ))}
      </ul>
    </div>
  );
}

function InfoBox({ tone, icon: Icon, title, children, className }: { tone: "red" | "amber"; icon: React.ElementType; title: string; children: React.ReactNode; className?: string }) {
  const map = { red: "border-red-200 bg-red-50 text-red-800", amber: "border-amber-200 bg-amber-50 text-amber-800" };
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-sm", map[tone], className)}>
      <div className="mb-1 flex items-center gap-1.5 font-semibold"><Icon size={14} /> {title}</div>
      <ul className="list-inside list-disc space-y-0.5 marker:text-current/50">{children}</ul>
    </div>
  );
}

function ProhibitedBox({ items }: { items: string[] }) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-slate-50 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><Ban size={13} /> Prohibited actions</div>
      <ul className="list-inside list-disc space-y-0.5 text-sm text-ink-muted">{items.map((p, i) => <li key={i}>{p}</li>)}</ul>
    </div>
  );
}

function Disclaimer({ text }: { text: string }) {
  return <div className="mt-4 rounded-lg bg-navy px-4 py-2.5 text-xs text-slate-200">{text}</div>;
}

function channelLabel(c: string): string {
  const map: Record<string, string> = {
    whatsapp_text: "WhatsApp text",
    voice_note: "Voice note",
    call_transcript: "Call transcript",
    manual: "Manual entry",
    fleet_api: "Fleet API event",
    document_upload: "Document upload",
  };
  return map[c] ?? c;
}

export { LEGAL_SOURCES };
