"use client";

import { useEffect, useState, useTransition } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { useCompany } from "@/lib/CompanyContext";

const SUGGESTIONS = [
  "Pull up the ACME lead",
  "Draft an estimate for ACME",
  "Lock the contract and generate an invoice",
];

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function lastAssistantText(messages: ReadonlyArray<{ role: string; content?: unknown }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const c = m.content;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function CommandBar() {
  const { companyId, activeWorkflowId, refreshFlow, refreshStatus } = useCompany();
  const { agent } = useAgent({ agentId: "quoteToCash" });
  const { copilotkit } = useCopilotKit();
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const tid = activeWorkflowId
      ? `quote-to-cash:${companyId}:${activeWorkflowId}:v6`
      : `quote-to-cash:${companyId}:onboarding:v6`;
    agent.threadId = tid;
  }, [agent, companyId, activeWorkflowId]);

  useEffect(() => {
    const tick = () => force((x) => x + 1);
    const sub = copilotkit.subscribeToAgentWithOptions(agent, {
      onMessagesChanged: tick,
      onRunInitialized: tick,
      onRunFailed: tick,
      onRunFinalized: () => {
        tick();
        void refreshFlow();
        void Promise.resolve().then(() => refreshStatus());
      },
    });
    return () => sub.unsubscribe();
  }, [agent, copilotkit, refreshFlow, refreshStatus]);

  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    setError(null);
    setValue("");
    agent.addMessage({ id: uuid(), role: "user", content: prompt });
    startTransition(() => {
      copilotkit
        .runAgent({ agent })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : String(err))
        );
    });
  };

  const onSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(value);
  };

  const reply = lastAssistantText(agent.messages);
  const running = agent.isRunning || isPending;

  return (
    <div className="border-b border-white/10 backdrop-blur-xl bg-white/[0.04] px-6 py-4 sticky top-0 z-10">
      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <span aria-hidden className="text-base">🪄</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask the agent — e.g. pull up ACME and draft an estimate"
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={running || !value.trim()}
          className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium px-4 py-1.5 disabled:opacity-40 transition-colors"
        >
          {running ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!running && !reply && !error && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="text-[11px] rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-0.5 text-white/40 hover:text-white/70 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {!error && reply && (
        <p className="mt-2 text-xs text-white/40 italic">{reply}</p>
      )}
    </div>
  );
}
