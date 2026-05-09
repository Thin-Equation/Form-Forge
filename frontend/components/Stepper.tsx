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
      className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 bg-zinc-50/60 dark:bg-zinc-950/60"
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
                  "rounded-full px-3 py-1 font-medium transition " +
                  (isCurrent
                    ? "bg-emerald-600 text-white"
                    : isPast
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                      : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700") +
                  (isCurrent ? " cursor-default" : " cursor-pointer") +
                  (isLoading ? " opacity-60" : "")
                }
              >
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/30 text-[10px]">
                  {i + 1}
                </span>
                {step.name}
              </button>
              {i < workflow.steps.length - 1 && (
                <span
                  aria-hidden
                  className="text-zinc-400 dark:text-zinc-600 select-none"
                >
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
