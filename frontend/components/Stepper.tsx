"use client";

import { useState } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { upsertFlow } from "@/lib/api";

export function Stepper() {
  const { companyId, activeWorkflowId, workflow, flow, refreshFlow } = useCompany();
  const [busy, setBusy] = useState<string | null>(null);

  if (!workflow || !activeWorkflowId) return null;

  const currentIdx = workflow.steps.findIndex((s) => s.id === flow?.step);

  const goto = async (stepId: string, component: string) => {
    if (!activeWorkflowId || stepId === flow?.step) return;
    setBusy(stepId);
    try {
      await upsertFlow(companyId, activeWorkflowId, {
        step: stepId,
        component,
        props: flow?.props ?? {},
        quote_id: flow?.quote_id || `Q-${companyId}`,
      });
      await refreshFlow();
    } finally {
      setBusy(null);
    }
  };

  return (
    <nav
      aria-label="Workflow steps"
      className="border-b border-white/10 backdrop-blur-xl bg-white/[0.03] px-6 py-3"
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {workflow.steps.map((step, i) => {
          const isCurrent = step.id === flow?.step;
          const isPast = currentIdx >= 0 && i < currentIdx;
          const isLoading = busy === step.id;
          return (
            <li key={step.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goto(step.id, step.component)}
                disabled={isCurrent || isLoading}
                className={
                  "rounded-full px-3 py-1 font-medium transition-all " +
                  (isCurrent
                    ? "bg-emerald-500/80 text-white shadow-lg shadow-emerald-500/25 border border-emerald-400/40"
                    : isPast
                      ? "bg-white/10 text-emerald-300 border border-emerald-500/25 hover:bg-white/15"
                      : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60") +
                  (isCurrent ? " cursor-default" : " cursor-pointer") +
                  (isLoading ? " opacity-60" : "")
                }
              >
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  {i + 1}
                </span>
                {step.name}
              </button>
              {i < workflow.steps.length - 1 && (
                <span aria-hidden className="text-white/20 select-none">→</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
