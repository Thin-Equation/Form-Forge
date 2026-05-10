"use client";

import { useState } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { approveSend } from "@/lib/api";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ApproveSendButton() {
  const { companyId, flow, refreshFlow } = useCompany();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invoiceId = String(
    flow?.props?.invoice_id ??
      flow?.props?.invoiceId ??
      `INV-${flow?.quote_id || companyId}`
  );

  const send = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await approveSend({
        company_id: companyId,
        invoice_id: invoiceId,
        idempotency_key: uuid(),
      });
      setResult(res.message);
      await refreshFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Approve & send invoice"}
      </button>
      {result && !error && (
        <span className="text-xs text-emerald-700 dark:text-emerald-400">
          {result}
        </span>
      )}
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
