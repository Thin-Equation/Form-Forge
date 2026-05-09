"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AgentRuntime } from "@/components/AgentRuntime";
import { CompanyProvider, useCompany } from "@/lib/CompanyContext";
import { DEMO_COMPANY_ID } from "@/lib/api";

function Header() {
  const { companyId, status, workflow, flow } = useCompany();
  const onboarded = status?.is_onboarded ?? false;
  return (
    <header className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          {workflow?.name ?? "Quote-to-Cash"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {onboarded
            ? "Ask the agent to pull a lead, draft an estimate, or generate an invoice."
            : "This company has no workflow yet."}
        </p>
      </div>
      <div className="flex items-center gap-2 font-mono text-xs">
        {flow?.step ? (
          <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5">
            step: {flow.step}
          </span>
        ) : null}
        <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-zinc-600 dark:text-zinc-300">
          {companyId}
        </span>
      </div>
    </header>
  );
}

function Body() {
  const { companyId, status, isLoading, error, activeWorkflowId } = useCompany();

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-4 text-sm">
          <strong className="block text-red-700 dark:text-red-300">
            Couldn&apos;t reach the backend.
          </strong>
          <span className="text-red-600 dark:text-red-400">{error.message}</span>
          <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
            Make sure the Python API is running at{" "}
            <code>{process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading {companyId}…
      </div>
    );
  }

  if (status && !status.is_onboarded) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md rounded-lg border border-zinc-300 dark:border-zinc-700 p-6 text-center">
          <h2 className="text-base font-semibold">No workflow configured</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">{companyId}</span> hasn&apos;t completed
            onboarding. Create a workflow via{" "}
            <code className="text-xs">POST /company/{companyId}/onboard</code>{" "}
            and reload.
          </p>
        </div>
      </div>
    );
  }

  if (!activeWorkflowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Selecting workflow…
      </div>
    );
  }

  return (
    <section className="flex-1 min-h-0">
      <AgentRuntime />
      <CopilotChat threadId={`quote-to-cash:${companyId}:${activeWorkflowId}`} />
    </section>
  );
}

function Page() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("co") ?? DEMO_COMPANY_ID;

  return (
    <CompanyProvider companyId={companyId}>
      <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <Body />
      </main>
    </CompanyProvider>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
