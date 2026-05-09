"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FlowStateResponse,
  type OnboardingStatus,
  type Workflow,
  getCompanyStatus,
  getFlow,
  getSystemPrompt,
  getWorkflow,
} from "@/lib/api";

type CompanyState = {
  companyId: string;
  status: OnboardingStatus | null;
  activeWorkflowId: string | null;
  workflow: Workflow | null;
  flow: FlowStateResponse | null;
  systemPrompt: string | null;
  isLoading: boolean;
  error: Error | null;
  setActiveWorkflowId: (id: string) => void;
  refreshFlow: () => Promise<void>;
  refreshStatus: () => void;
};

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({
  companyId,
  children,
}: {
  companyId: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [activeWorkflowId, setActiveWorkflowIdRaw] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [flow, setFlow] = useState<FlowStateResponse | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // tick triggers a re-fetch of company status without needing activeWorkflowId in deps
  const [tick, setTick] = useState(0);
  // ref so the status effect can read activeWorkflowId without a stale closure
  const activeWorkflowIdRef = useRef(activeWorkflowId);

  useEffect(() => {
    activeWorkflowIdRef.current = activeWorkflowId;
  }, [activeWorkflowId]);

  const refreshStatus = useCallback(() => {
    setActiveWorkflowIdRaw(null);
    setStatus(null);
    setWorkflow(null);
    setFlow(null);
    setSystemPrompt(null);
    setError(null);
    setTick((t: number) => t + 1);
  }, []);

  // Load company status. Re-runs when companyId or tick changes.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getCompanyStatus(companyId)
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        if (s.is_onboarded && s.workflows.length > 0 && !activeWorkflowIdRef.current) {
          setActiveWorkflowIdRaw(s.workflows[0].workflow_id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, tick]);

  // Whenever activeWorkflowId changes, fetch workflow + flow + prompt in parallel.
  useEffect(() => {
    if (!activeWorkflowId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getWorkflow(companyId, activeWorkflowId),
      getFlow(companyId, activeWorkflowId),
      getSystemPrompt(companyId, activeWorkflowId),
    ])
      .then(([wf, fl, sp]) => {
        if (cancelled) return;
        setWorkflow(wf);
        setFlow(fl);
        setSystemPrompt(sp.system_prompt);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, activeWorkflowId]);

  const refreshFlow = useCallback(async () => {
    if (!activeWorkflowId) return;
    const fl = await getFlow(companyId, activeWorkflowId);
    setFlow(fl);
  }, [companyId, activeWorkflowId]);

  const value = useMemo<CompanyState>(
    () => ({
      companyId,
      status,
      activeWorkflowId,
      workflow,
      flow,
      systemPrompt,
      isLoading,
      error,
      setActiveWorkflowId: setActiveWorkflowIdRaw,
      refreshFlow,
      refreshStatus,
    }),
    [
      companyId,
      status,
      activeWorkflowId,
      workflow,
      flow,
      systemPrompt,
      isLoading,
      error,
      refreshFlow,
      refreshStatus,
    ]
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used inside <CompanyProvider>");
  }
  return ctx;
}
