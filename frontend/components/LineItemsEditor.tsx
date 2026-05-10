"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { updateEstimate, type LineItem } from "@/lib/api";

const DEFAULT_ITEMS: LineItem[] = [
  { id: 1, description: "Labor", qty: 8, rate: 150 },
  { id: 2, description: "Materials", qty: 1, rate: 1200 },
];

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (x): x is LineItem =>
        !!x &&
        typeof x === "object" &&
        "id" in x &&
        "description" in x &&
        "qty" in x &&
        "rate" in x
    )
    .map((x) => ({
      id: Number(x.id),
      description: String(x.description ?? ""),
      qty: Number(x.qty ?? 0),
      rate: Number(x.rate ?? 0),
    }));
}

function fmtUSD(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function LineItemsEditor() {
  const { companyId, activeWorkflowId, flow, refreshFlow } = useCompany();
  const initial = useMemo(
    () => toLineItems(flow?.props?.line_items),
    [flow?.props?.line_items]
  );
  const [items, setItems] = useState<LineItem[]>(initial.length ? initial : DEFAULT_ITEMS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resync when the backend pushes new line items (e.g. agent updated them).
  useEffect(() => {
    if (initial.length > 0) setItems(initial);
  }, [initial]);

  const localTotal = items.reduce((sum, it) => sum + it.qty * it.rate, 0);

  const persistedTotal =
    typeof flow?.props?.total === "number" ? (flow.props.total as number) : null;

  const commit = async (next: LineItem[]) => {
    if (!activeWorkflowId) return;
    setSaving(true);
    setError(null);
    try {
      await updateEstimate({
        company_id: companyId,
        workflow_id: activeWorkflowId,
        quote_id: flow?.quote_id || `Q-${companyId}`,
        line_items: next,
      });
      await refreshFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (id: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const addRow = () => {
    const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
    const next = [...items, { id: nextId, description: "New item", qty: 1, rate: 0 }];
    setItems(next);
    void commit(next);
  };

  const removeRow = (id: number) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    void commit(next);
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Line items
        </span>
        <span className="text-[11px] text-zinc-500">
          {saving ? "Saving…" : "Edits save automatically"}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Description</th>
            <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
            <th className="text-right px-3 py-2 font-medium w-28">Rate</th>
            <th className="text-right px-3 py-2 font-medium w-28">Subtotal</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.id}
              className="border-t border-zinc-100 dark:border-zinc-800/60"
            >
              <td className="px-2 py-1.5">
                <input
                  type="text"
                  value={it.description}
                  onChange={(e) => updateItem(it.id, { description: e.target.value })}
                  onBlur={() => commit(items)}
                  className="w-full bg-transparent px-2 py-1 rounded outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60"
                />
              </td>
              <td className="px-1 py-1.5">
                <input
                  type="number"
                  step="0.01"
                  value={it.qty}
                  onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })}
                  onBlur={() => commit(items)}
                  className="w-full bg-transparent px-2 py-1 text-right rounded outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60"
                />
              </td>
              <td className="px-1 py-1.5">
                <input
                  type="number"
                  step="0.01"
                  value={it.rate}
                  onChange={(e) => updateItem(it.id, { rate: Number(e.target.value) })}
                  onBlur={() => commit(items)}
                  className="w-full bg-transparent px-2 py-1 text-right rounded outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800/60"
                />
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-zinc-700 dark:text-zinc-300">
                {fmtUSD(it.qty * it.rate)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <button
                  type="button"
                  onClick={() => removeRow(it.id)}
                  className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 text-xs"
                  aria-label={`Remove ${it.description}`}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <td colSpan={3} className="px-4 py-2">
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                + Add line item
              </button>
            </td>
            <td className="px-3 py-2 text-right font-mono font-semibold">
              {fmtUSD(persistedTotal ?? localTotal)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 border-t border-zinc-200 dark:border-zinc-800">
          {error}
        </div>
      )}
    </div>
  );
}
