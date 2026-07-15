"use client";

import { cn } from "@/lib/utils";
import type { WorkflowState } from "@/lib/types";
import { WORKFLOW_STATE_LABEL } from "@/lib/types";
import { HAPPY_PATH } from "@/lib/workflow/machine";

const DISPLAY: WorkflowState[] = [
  "intake_processing",
  "document_validation",
  "triage_complete",
  "action_plan_generated",
  "human_review_required",
  "lawyer_assigned",
  "resolved",
];

export function Stepper({ state }: { state: WorkflowState }) {
  if (state === "abstained" || state === "failed") {
    return (
      <div className="flex items-center gap-2">
        <span className={cn("pill", state === "abstained" ? "bg-violet-100 text-violet-700" : "bg-sev-criticalBg text-sev-critical")}>
          {state === "abstained" ? "System abstained — deferred to human" : "Workflow failed — retry required"}
        </span>
      </div>
    );
  }
  const currentIdx = HAPPY_PATH.indexOf(state);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DISPLAY.map((s, idx) => {
        const sIdx = HAPPY_PATH.indexOf(s);
        const done = sIdx < currentIdx;
        const active = sIdx <= currentIdx && (idx === DISPLAY.length - 1 ? currentIdx >= sIdx : HAPPY_PATH.indexOf(DISPLAY[idx + 1] ?? "closed") > currentIdx);
        const isCurrent = state === s || (sIdx <= currentIdx && (DISPLAY[idx + 1] ? HAPPY_PATH.indexOf(DISPLAY[idx + 1]) > currentIdx : true));
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                done ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-brand text-white" : "bg-slate-100 text-slate-400",
              )}
            >
              {WORKFLOW_STATE_LABEL[s]}
            </span>
            {idx < DISPLAY.length - 1 && <span className="text-ink-faint">·</span>}
          </div>
        );
      })}
    </div>
  );
}
