"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/lib/CompanyContext";
import {
  patchFlow,
  saveSubmission,
  upsertFlow,
  type FormField,
  type WorkflowStep,
} from "@/lib/api";
import { LineItemsEditor } from "./LineItemsEditor";
import { ApproveSendButton } from "./ApproveSendButton";

const LINE_ITEM_KEYS = new Set(["line_items", "lineItems"]);

function isLineItemField(field: FormField, value: unknown): boolean {
  if (LINE_ITEM_KEYS.has(field.key)) return true;
  // Defensive: treat any array of {qty, rate} as line items.
  if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
    const first = value[0] as Record<string, unknown>;
    return "qty" in first && "rate" in first;
  }
  return false;
}

export function GenerativeForm() {
  const { companyId, activeWorkflowId, workflow, flow, refreshFlow } = useCompany();

  const step: WorkflowStep | null = useMemo(() => {
    if (!workflow) return null;
    return workflow.steps.find((s) => s.id === flow?.step) ?? workflow.steps[0] ?? null;
  }, [workflow, flow?.step]);

  // Local edit buffer mirrors flow.props for the visible fields and is the
  // source of truth for input controls. Flushed to the backend on blur.
  const [draft, setDraft] = useState<Record<string, unknown>>(flow?.props ?? {});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFlowPropsRef = useRef<Record<string, unknown>>(flow?.props ?? {});

  // Resync from backend on flow.props changes (agent or other tab edits),
  // but only for keys not actively being edited locally.
  useEffect(() => {
    const incoming = flow?.props ?? {};
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(incoming)) {
        // accept incoming if our local matches the previous backend snapshot
        if (next[k] === undefined || next[k] === lastFlowPropsRef.current[k]) {
          next[k] = incoming[k];
        }
      }
      return next;
    });
    lastFlowPropsRef.current = incoming;
  }, [flow?.props]);

  if (!workflow || !step) return null;

  const setValue = (key: string, value: unknown) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const flush = async (key: string) => {
    if (!activeWorkflowId) return;
    const value = draft[key];
    // Skip if unchanged from last persisted snapshot
    if (lastFlowPropsRef.current[key] === value) return;
    setSavingKey(key);
    setError(null);
    try {
      await patchFlow(companyId, activeWorkflowId, { [key]: value });
      lastFlowPropsRef.current = { ...lastFlowPropsRef.current, [key]: value };
      await refreshFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingKey(null);
    }
  };

  const advance = async () => {
    if (!activeWorkflowId) return;
    const nextStepId = step.transitions[0];
    if (!nextStepId) return;
    const nextStep = workflow.steps.find((s) => s.id === nextStepId);
    if (!nextStep) return;
    setSavingKey("__advance__");
    setError(null);
    try {
      // Persist a submission record of what was just completed.
      await saveSubmission(companyId, activeWorkflowId, {
        step: step.id,
        ...draft,
      }).catch(() => {
        // Best-effort: not all steps are required to be submitted.
      });
      await upsertFlow(companyId, activeWorkflowId, {
        step: nextStep.id,
        component: nextStep.component,
        props: draft,
        quote_id: flow?.quote_id || `Q-${companyId}`,
      });
      await refreshFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingKey(null);
    }
  };

  const isInvoice = step.id === "invoice" || step.component === "InvoiceAction";
  const nextStepName = (() => {
    const nid = step.transitions[0];
    if (!nid) return null;
    return workflow.steps.find((s) => s.id === nid)?.name ?? null;
  })();

  return (
    <form
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 shadow-sm"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-semibold tracking-tight">{step.name}</h2>
        {step.description && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {step.description}
          </p>
        )}
      </div>

      <div className="px-6 py-5 space-y-4">
        {step.fields.map((field) => {
          const value = draft[field.key];
          if (isLineItemField(field, value)) {
            return (
              <div key={field.key} className="space-y-1.5">
                <FieldLabel field={field} />
                <LineItemsEditor />
              </div>
            );
          }
          return (
            <FieldRow
              key={field.key}
              field={field}
              value={value}
              saving={savingKey === field.key}
              onChange={(v) => setValue(field.key, v)}
              onCommit={() => flush(field.key)}
            />
          );
        })}

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-b-xl">
        <span className="text-[11px] text-zinc-500">
          Step <span className="font-mono">{step.id}</span>
          {flow?.quote_id ? (
            <>
              {" · "}
              quote <span className="font-mono">{flow.quote_id}</span>
            </>
          ) : null}
        </span>

        <div className="flex items-center gap-2">
          {isInvoice && <ApproveSendButton />}
          {nextStepName && (
            <button
              type="button"
              onClick={advance}
              disabled={savingKey === "__advance__"}
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
            >
              {savingKey === "__advance__"
                ? "Saving…"
                : `Save & continue → ${nextStepName}`}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function FieldLabel({ field }: { field: FormField }) {
  return (
    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldRow({
  field,
  value,
  saving,
  onChange,
  onCommit,
}: {
  field: FormField;
  value: unknown;
  saving: boolean;
  onChange: (v: unknown) => void;
  onCommit: () => void;
}) {
  const stringValue = value === undefined || value === null ? "" : String(value);

  const baseInput =
    "w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1.5 sm:gap-3 items-start">
      <FieldLabel field={field} />
      <div className="space-y-1">
        {field.type === "select" ? (
          <select
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            className={baseInput}
          >
            <option value="">{field.placeholder || "Select…"}</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            placeholder={field.placeholder}
            rows={3}
            className={baseInput}
          />
        ) : field.type === "checkbox" ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => {
                onChange(e.target.checked);
                onCommit();
              }}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
            />
            <span className="text-zinc-600 dark:text-zinc-400">
              {field.placeholder || "Yes"}
            </span>
          </label>
        ) : field.type === "number" ? (
          <input
            type="number"
            value={stringValue}
            onChange={(e) =>
              onChange(e.target.value === "" ? "" : Number(e.target.value))
            }
            onBlur={onCommit}
            placeholder={field.placeholder}
            className={baseInput}
          />
        ) : field.type === "date" ? (
          <input
            type="date"
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            className={baseInput}
          />
        ) : (
          <input
            type="text"
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            placeholder={field.placeholder}
            className={baseInput}
          />
        )}
        {saving && (
          <span className="text-[10px] text-zinc-400">Saving…</span>
        )}
      </div>
    </div>
  );
}
