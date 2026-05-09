"use client";

import { useCompany } from "@/lib/CompanyContext";
import { AgentRuntime } from "./AgentRuntime";
import { CommandBar } from "./CommandBar";
import { Stepper } from "./Stepper";
import { GenerativeForm } from "./GenerativeForm";

export function WorkflowSurface() {
  const { status, workflow, flow, isLoading } = useCompany();
  const onboarded = status?.is_onboarded ?? false;
  const notice = flow?.props?.notice;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Mounts agent context + frontend tools (no UI). */}
      <AgentRuntime />

      <CommandBar />
      <Stepper />

      <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {typeof notice === "string" && notice.trim() && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-2 text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Agent note: </span>
              {notice}
            </div>
          )}

          {!onboarded ? (
            <OnboardingPrompt />
          ) : workflow ? (
            <GenerativeForm />
          ) : isLoading ? (
            <div className="text-sm text-zinc-500">Loading workflow…</div>
          ) : (
            <div className="text-sm text-zinc-500">No active workflow.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingPrompt() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 p-8 text-center">
      <h2 className="text-lg font-semibold tracking-tight">
        No workflow yet
      </h2>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
        Use the bar above to describe your sales process. The agent will
        generate the steps and forms — you can edit each form inline once
        it&apos;s built.
      </p>
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        Try:&nbsp;
        <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
          Set up a quote-to-cash workflow with lead, estimate, and invoice steps.
        </code>
      </p>
    </div>
  );
}
