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
      <AgentRuntime />

      <CommandBar />
      <Stepper />

      <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {typeof notice === "string" && notice.trim() && (
            <div className="rounded-xl backdrop-blur-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-xs text-amber-200">
              <span className="font-semibold">Agent note: </span>
              {notice}
            </div>
          )}

          {!onboarded ? (
            <OnboardingPrompt />
          ) : workflow ? (
            <GenerativeForm />
          ) : isLoading ? (
            <div className="text-sm text-white/40">Loading workflow…</div>
          ) : (
            <div className="text-sm text-white/40">No active workflow.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingPrompt() {
  return (
    <div className="rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl p-8 text-center">
      <h2 className="text-lg font-semibold tracking-tight text-white">
        No workflow yet
      </h2>
      <p className="mt-1.5 text-sm text-white/50 max-w-md mx-auto">
        Use the bar above to describe your sales process. The agent will
        generate the steps and forms — you can edit each form inline once
        it&apos;s built.
      </p>
      <p className="mt-4 text-xs text-white/30">
        Try:&nbsp;
        <code className="px-1.5 py-0.5 rounded-md bg-white/10 text-white/50">
          Set up a quote-to-cash workflow with lead, estimate, and invoice steps.
        </code>
      </p>
    </div>
  );
}
