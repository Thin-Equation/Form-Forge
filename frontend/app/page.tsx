"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorkflowSurface } from "@/components/WorkflowSurface";
import { CompanyProvider, useCompany } from "@/lib/CompanyContext";
import { DEMO_COMPANY_ID } from "@/lib/api";

function Header() {
  const { companyId, status, workflow, flow } = useCompany();
  const onboarded = status?.is_onboarded ?? false;
  return (
    <header className="flex items-center justify-between backdrop-blur-xl bg-white/5 border-b border-white/10 px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-white">
          {workflow?.name ?? "Form Forge"}
        </h1>
        <p className="text-sm text-white/50">
          {onboarded
            ? "Edit any field directly. The agent reacts to your changes and to natural-language commands."
            : "Describe your process in the bar below — the agent will build the workflow."}
        </p>
      </div>
      <div className="flex items-center gap-2 font-mono text-xs">
        {flow?.step ? (
          <span className="rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 px-2.5 py-0.5">
            step: {flow.step}
          </span>
        ) : null}
        {!onboarded && (
          <span className="rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25 px-2.5 py-0.5">
            onboarding
          </span>
        )}
        <span className="rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-white/60">
          {companyId}
        </span>
      </div>
    </header>
  );
}

function Body() {
  const { companyId, status, isLoading, error } = useCompany();

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md rounded-2xl backdrop-blur-xl bg-red-500/10 border border-red-500/20 shadow-2xl p-4 text-sm">
          <strong className="block text-red-300">
            Couldn&apos;t reach the backend.
          </strong>
          <span className="text-red-400">{error.message}</span>
          <p className="mt-2 text-xs text-red-300/70">
            Make sure the Python API is running at{" "}
            <code>{process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-white/40">
        Loading {companyId}…
      </div>
    );
  }

  return <WorkflowSurface />;
}

function Page() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("co") ?? DEMO_COMPANY_ID;

  return (
    <CompanyProvider companyId={companyId}>
      <main className="flex flex-1 flex-col">
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
