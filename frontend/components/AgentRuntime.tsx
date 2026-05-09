"use client";

import { useCallback } from "react";
import { z } from "zod";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { useCompany } from "@/lib/CompanyContext";
import { approveSend, updateEstimate, type LineItem } from "@/lib/api";

/**
 * Mounts inside the chat surface. Pushes company/workflow/flow context to
 * Gemini and registers the two action tools the agent can call when the user
 * confirms an estimate edit or an invoice approval.
 */
export function AgentRuntime() {
  const { companyId, activeWorkflowId, workflow, flow, systemPrompt, refreshFlow } =
    useCompany();

  // ---- Agent context (pushed every turn) -----------------------------------

  useAgentContext({
    description: "The company the user belongs to.",
    value: companyId,
  });

  useAgentContext({
    description:
      "The active workflow definition for this company (JSON-encoded).",
    value: workflow ? JSON.stringify(workflow) : "null",
  });

  useAgentContext({
    description:
      "Workflow system prompt. Use this to determine which step to render and which fields each form must contain.",
    value: systemPrompt ?? "",
  });

  useAgentContext({
    description:
      "Current persisted flow state — step, component, props, quote_id (JSON-encoded). Treat as source of truth.",
    value: flow ? JSON.stringify(flow) : "null",
  });

  // ---- Tool: update_estimate ----------------------------------------------

  const updateEstimateHandler = useCallback(
    async (args: {
      line_items: LineItem[];
      quote_id?: string;
    }) => {
      if (!activeWorkflowId) {
        return {
          ok: false,
          error: "No active workflow. Cannot update estimate.",
        };
      }
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
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
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

  // ---- Tool: approve_send -------------------------------------------------

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
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
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

  return null;
}
