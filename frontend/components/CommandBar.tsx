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

  // Bind a stable thread id so the agent keeps context across prompts.
  useEffect(() => {
    const tid = activeWorkflowId
      ? `quote-to-cash:${companyId}:${activeWorkflowId}:v6`
      : `quote-to-cash:${companyId}:onboarding:v6`;
    agent.threadId = tid;
  }, [agent, companyId, activeWorkflowId]);

  // Re-render when the agent emits messages so we can show its reply.
  useEffect(() => {
    const tick = () => force((x) => x + 1);
    const sub = copilotkit.subscribeToAgentWithOptions(agent, {
      onMessagesChanged: tick,
      onRunInitialized: tick,
      onRunFailed: tick,
      onRunFinalized: () => {
        tick();
        // After every run, pull the latest backend state so the form refreshes.
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(value);
  };

  const reply = lastAssistantText(agent.messages);
  const running = agent.isRunning || isPending;

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur px-6 py-4 sticky top-0 z-10">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <span aria-hidden className="text-base">🪄</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask the agent — e.g. pull up ACME and draft an estimate"
          disabled={running}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-zinc-400 disabled:opacity-50"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={running || !value.trim()}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-xs font-medium px-3 py-1.5 disabled:opacity-40"
        >
          {running ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!running && !reply && !error && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="text-[11px] rounded-full border border-zinc-200 dark:border-zinc-800 px-2.5 py-0.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {!error && reply && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 italic">
          {reply}
        </p>
      )}
    </div>
  );
}
