"use client";

import { useCallback } from "react";
import { z } from "zod";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { useCompany } from "@/lib/CompanyContext";
import {
  approveSend,
  lookupSubmission,
  onboardCompany,
  saveSubmission,
  updateEstimate,
  upsertFlow,
  type FieldType,
  type LineItem,
  type Workflow,
} from "@/lib/api";

/**
 * Mounts inside the CopilotKit surface. Pushes company/workflow/flow context to
 * Gemini and registers all action tools the agent can call.
 */
export function AgentRuntime() {
  const {
    companyId,
    activeWorkflowId,
    workflow,
    flow,
    systemPrompt,
    status,
    refreshFlow,
    refreshStatus,
  } = useCompany();

  // ---- Agent context -------------------------------------------------------

  useAgentContext({
    description: "The company ID for the current user.",
    value: companyId,
  });

  useAgentContext({
    description:
      "Whether this company has completed onboarding. 'false' means no workflow exists yet — offer to build one. 'true' means a workflow is active.",
    value: status ? (status.is_onboarded ? "true" : "false") : "unknown",
  });

  useAgentContext({
    description:
      "Active workflow definition (JSON). Contains steps, their component names, and form field specs.",
    value: workflow ? JSON.stringify(workflow) : "null",
  });

  useAgentContext({
    description:
      "Workflow system prompt — use this to determine which render function maps to each step and what fields each form must contain.",
    value: systemPrompt ?? "",
  });

  useAgentContext({
    description:
      "Current persisted flow state — step, component, props, quote_id (JSON). Treat as source of truth for where the user currently is in the workflow.",
    value: flow ? JSON.stringify(flow) : "null",
  });

  // ---- Tool: advance_step --------------------------------------------------

  const advanceStepHandler = useCallback(
    async (args: {
      step: string;
      component: string;
      props?: Record<string, unknown>;
      quote_id?: string;
    }) => {
      if (!activeWorkflowId) return { ok: false, error: "No active workflow." };
      try {
        await upsertFlow(companyId, activeWorkflowId, {
          step: args.step,
          component: args.component,
          props: args.props ?? {},
          quote_id: args.quote_id ?? flow?.quote_id ?? `Q-${companyId}`,
        });
        await refreshFlow();
        return { ok: true, step: args.step };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [companyId, activeWorkflowId, flow?.quote_id, refreshFlow]
  );

  useFrontendTool(
    {
      name: "advance_step",
      description:
        "Move the workflow to a new step and persist the state to the backend. " +
        "Call this whenever the user advances to a new step (e.g. lead → estimate → invoice). " +
        "Use the workflow definition from context to look up the correct component name for the target step. " +
        "Include any form props the user has filled in so far.",
      parameters: z.object({
        step: z.string().describe("Target step ID from the workflow definition"),
        component: z.string().describe("Component name for this step from the workflow definition"),
        props: z.record(z.string(), z.unknown()).optional().describe("Form data to persist with this step"),
        quote_id: z.string().optional(),
      }),
      handler: advanceStepHandler,
      followUp: true,
    },
    [advanceStepHandler]
  );

  // ---- Tool: save_submission -----------------------------------------------

  const saveSubmissionHandler = useCallback(
    async (args: { step: string; data: Record<string, unknown> }) => {
      if (!activeWorkflowId) return { ok: false, error: "No active workflow." };
      try {
        const result = await saveSubmission(companyId, activeWorkflowId, {
          step: args.step,
          ...args.data,
        });
        return { ok: true, submission_id: result.submission_id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [companyId, activeWorkflowId]
  );

  useFrontendTool(
    {
      name: "save_submission",
      description:
        "Save a completed step's form data as a permanent record. " +
        "Call this when the user finalises a step (locks a lead, approves an estimate, submits a survey). " +
        "These records power the dashboard and can be retrieved later with lookup_record.",
      parameters: z.object({
        step: z.string().describe("The workflow step ID this data belongs to"),
        data: z.record(z.string(), z.unknown()).describe("The completed form data to save"),
      }),
      handler: saveSubmissionHandler,
    },
    [saveSubmissionHandler]
  );

  // ---- Tool: lookup_record -------------------------------------------------

  const lookupRecordHandler = useCallback(
    async (args: { step: string; customer: string }) => {
      if (!activeWorkflowId) return { ok: false, data: null, error: "No active workflow." };
      try {
        const result = await lookupSubmission(companyId, activeWorkflowId, args.step, args.customer);
        return { ok: true, data: result.data };
      } catch {
        return { ok: false, data: null };
      }
    },
    [companyId, activeWorkflowId]
  );

  useFrontendTool(
    {
      name: "lookup_record",
      description:
        "Find a prior submission by step and customer name. " +
        "Use this when the user says 'pull up [customer]' — returns existing data to pre-fill the rendered form. " +
        "Returns null data if no record is found (render an empty form instead).",
      parameters: z.object({
        step: z.string().describe("The workflow step to search within, e.g. 'lead'"),
        customer: z.string().describe("Customer name to search for"),
      }),
      handler: lookupRecordHandler,
      followUp: true,
    },
    [lookupRecordHandler]
  );

  // ---- Tool: update_estimate -----------------------------------------------

  const updateEstimateHandler = useCallback(
    async (args: { line_items: LineItem[]; quote_id?: string }) => {
      if (!activeWorkflowId) return { ok: false, error: "No active workflow." };
      const quote_id = args.quote_id || flow?.quote_id || `Q-${companyId}`;
      try {
        const result = await updateEstimate({
          company_id: companyId,
          workflow_id: activeWorkflowId,
          quote_id,
          line_items: args.line_items,
        });
        await refreshFlow();
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [companyId, activeWorkflowId, flow?.quote_id, refreshFlow]
  );

  useFrontendTool(
    {
      name: "update_estimate",
      description:
        "Persist edited line items for the current estimate. Returns the recomputed total and the latest props the next render should use.",
      parameters: z.object({
        line_items: z.array(
          z.object({
            id: z.number(),
            description: z.string(),
            qty: z.number(),
            rate: z.number(),
          })
        ),
        quote_id: z.string().optional(),
      }),
      handler: updateEstimateHandler,
      followUp: true,
    },
    [updateEstimateHandler]
  );

  // ---- Tool: approve_send --------------------------------------------------

  const approveSendHandler = useCallback(
    async (args: { invoice_id: string; idempotency_key?: string }) => {
      try {
        const result = await approveSend({
          company_id: companyId,
          invoice_id: args.invoice_id,
          idempotency_key:
            args.idempotency_key ??
            (typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`),
        });
        await refreshFlow();
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [companyId, refreshFlow]
  );

  useFrontendTool(
    {
      name: "approve_send",
      description:
        "Approve and send the current invoice. Idempotent — duplicate calls with the same idempotency_key are safe.",
      parameters: z.object({
        invoice_id: z.string(),
        idempotency_key: z.string().optional(),
      }),
      handler: approveSendHandler,
      followUp: true,
    },
    [approveSendHandler]
  );

  // ---- Tool: onboard_company -----------------------------------------------

  const onboardCompanyHandler = useCallback(
    async (args: {
      workflow_name: string;
      steps: Array<{
        id: string;
        name: string;
        description: string;
        fields: Array<{
          key: string;
          label: string;
          type?: string;
          required?: boolean;
        }>;
      }>;
    }) => {
      const workflowId = `${args.workflow_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${Date.now()}`;
      const stepIds = args.steps.map((s) => s.id);

      const workflow: Workflow = {
        workflow_id: workflowId,
        name: args.workflow_name,
        steps: args.steps.map((s, i) => ({
          id: s.id,
          name: s.name,
          component: s.name.replace(/\s+/g, "") + "Form",
          description: s.description,
          transitions: i < stepIds.length - 1 ? [stepIds[i + 1]] : [],
          fields: s.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: (f.type ?? "text") as FieldType,
            required: f.required ?? false,
            options: [],
            placeholder: "",
          })),
        })),
      };

      try {
        await onboardCompany(companyId, workflow);
        refreshStatus();
        return {
          ok: true,
          workflow_id: workflowId,
          message: "Workflow created! The flow is now active.",
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [companyId, refreshStatus]
  );

  useFrontendTool(
    {
      name: "onboard_company",
      description:
        "Create the company's first workflow configuration. " +
        "Call this after gathering the workflow name and step definitions from the user during onboarding. " +
        "Transitions are auto-wired in order (each step flows to the next). " +
        "The last step has no transition (it is terminal).",
      parameters: z.object({
        workflow_name: z
          .string()
          .describe("Display name for the workflow, e.g. 'Quote to Cash'"),
        steps: z
          .array(
            z.object({
              id: z
                .string()
                .describe("Unique step identifier, lowercase-hyphenated, e.g. 'lead', 'survey'"),
              name: z.string().describe("Display name for the step"),
              description: z.string().describe("What happens in this step"),
              fields: z
                .array(
                  z.object({
                    key: z.string().describe("Field identifier, camelCase"),
                    label: z.string().describe("Display label shown to the user"),
                    type: z
                      .enum(["text", "number", "select", "date", "textarea", "checkbox"])
                      .optional()
                      .describe("Field input type (default: text)"),
                    required: z.boolean().optional(),
                  })
                )
                .describe("Form fields collected at this step"),
            })
          )
          .min(1)
          .describe("Workflow steps in order, first to last"),
      }),
      handler: onboardCompanyHandler,
      followUp: true,
    },
    [onboardCompanyHandler]
  );

  return null;
}
