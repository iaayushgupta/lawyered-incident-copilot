"use client";

import { useEffect } from "react";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 4200));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const icon = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle };
  const tone = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icon[t.kind];
        return (
          <div key={t.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-pop", tone[t.kind])}>
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-current/60 hover:text-current">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
