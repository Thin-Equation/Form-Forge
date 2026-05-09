const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const DEMO_COMPANY_ID = "acme-co";

// ---------------------------------------------------------------------------
// Schema mirrors of backend/app/schemas.py
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "number"
  | "select"
  | "date"
  | "textarea"
  | "checkbox";

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  placeholder: string;
};

export type WorkflowStep = {
  id: string;
  name: string;
  component: string;
  description: string;
  transitions: string[];
  fields: FormField[];
};

export type Workflow = {
  workflow_id: string;
  name: string;
  steps: WorkflowStep[];
};

export type WorkflowSummary = {
  workflow_id: string;
  name: string;
  step_count: number;
  current_step: string | null;
};

export type OnboardingStatus = {
  company_id: string;
  is_onboarded: boolean;
  workflows: WorkflowSummary[];
};

export type FlowStateResponse = {
  company_id: string;
  workflow_id: string;
  step: string;
  component: string;
  props: Record<string, unknown>;
  quote_id: string;
  updated_at?: string | null;
};

export type LineItem = {
  id: number;
  description: string;
  qty: number;
  rate: number;
};

export type EstimateUpdateRequest = {
  company_id: string;
  workflow_id: string;
  quote_id: string;
  line_items: LineItem[];
};

export type EstimateUpdateResponse = {
  component: string;
  step: string;
  props: Record<string, unknown>;
};

export type ApproveSendRequest = {
  company_id: string;
  invoice_id: string;
  idempotency_key?: string;
};

export type ApproveSendResponse = {
  sent: boolean;
  message: string;
};

export type Submission = {
  submission_id: string;
  step: string;
  data: Record<string, unknown>;
  created_at?: string;
};

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${init?.method ?? "GET"} ${path} -> ${res.status}${body ? ` ${body}` : ""}`
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Company status / onboarding
// ---------------------------------------------------------------------------

export function getCompanyStatus(companyId: string) {
  return jsonFetch<OnboardingStatus>(`/company/${enc(companyId)}/status`);
}

export function onboardCompany(companyId: string, workflow: Workflow) {
  return jsonFetch<{ workflow: Workflow; initial_flow: FlowStateResponse }>(
    `/company/${enc(companyId)}/onboard`,
    { method: "POST", body: JSON.stringify({ workflow }) }
  );
}

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

export function listWorkflows(companyId: string) {
  return jsonFetch<WorkflowSummary[]>(`/workflow/${enc(companyId)}`);
}

export function getWorkflow(companyId: string, workflowId: string) {
  return jsonFetch<Workflow>(
    `/workflow/${enc(companyId)}/${enc(workflowId)}`
  );
}

export function createWorkflow(companyId: string, workflow: Workflow) {
  return jsonFetch<Workflow>(`/workflow/${enc(companyId)}`, {
    method: "POST",
    body: JSON.stringify(workflow),
  });
}

export function updateWorkflow(
  companyId: string,
  workflowId: string,
  workflow: Workflow
) {
  return jsonFetch<Workflow>(
    `/workflow/${enc(companyId)}/${enc(workflowId)}`,
    { method: "PUT", body: JSON.stringify(workflow) }
  );
}

export function deleteWorkflow(companyId: string, workflowId: string) {
  return jsonFetch<void>(
    `/workflow/${enc(companyId)}/${enc(workflowId)}`,
    { method: "DELETE" }
  );
}

export function getSystemPrompt(companyId: string, workflowId: string) {
  return jsonFetch<{ system_prompt: string }>(
    `/workflow/${enc(companyId)}/${enc(workflowId)}/system-prompt`
  );
}

// ---------------------------------------------------------------------------
// Flow state
// ---------------------------------------------------------------------------

export function getFlow(companyId: string, workflowId: string) {
  return jsonFetch<FlowStateResponse>(
    `/flow/${enc(companyId)}/${enc(workflowId)}`
  );
}

export function upsertFlow(
  companyId: string,
  workflowId: string,
  body: { step: string; component: string; props?: Record<string, unknown>; quote_id?: string }
) {
  return jsonFetch<FlowStateResponse>(
    `/flow/${enc(companyId)}/${enc(workflowId)}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function patchFlow(
  companyId: string,
  workflowId: string,
  partialProps: Record<string, unknown>
) {
  return jsonFetch<FlowStateResponse>(
    `/flow/${enc(companyId)}/${enc(workflowId)}`,
    { method: "PATCH", body: JSON.stringify(partialProps) }
  );
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export function saveSubmission(
  companyId: string,
  workflowId: string,
  data: Record<string, unknown>
) {
  return jsonFetch<{ submission_id: string } & Record<string, unknown>>(
    `/submissions/${enc(companyId)}/${enc(workflowId)}`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export function listSubmissions(
  companyId: string,
  workflowId: string,
  opts: { step?: string; search?: string; limit?: number } = {}
) {
  const params = new URLSearchParams();
  if (opts.step) params.set("step", opts.step);
  if (opts.search) params.set("search", opts.search);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return jsonFetch<Submission[]>(
    `/submissions/${enc(companyId)}/${enc(workflowId)}${qs ? `?${qs}` : ""}`
  );
}

export function lookupSubmission(
  companyId: string,
  workflowId: string,
  step: string,
  search: string
) {
  const qs = new URLSearchParams({ step, search }).toString();
  return jsonFetch<Submission>(
    `/submissions/${enc(companyId)}/${enc(workflowId)}/lookup?${qs}`
  );
}

// ---------------------------------------------------------------------------
// Actions (called from frontend tools)
// ---------------------------------------------------------------------------

export function updateEstimate(req: EstimateUpdateRequest) {
  return jsonFetch<EstimateUpdateResponse>(`/actions/estimate-update`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function approveSend(req: ApproveSendRequest) {
  return jsonFetch<ApproveSendResponse>(`/actions/approve-send`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}
