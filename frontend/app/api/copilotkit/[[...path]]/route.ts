import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  BuiltInAgent,
} from "@copilotkit/runtime/v2";

export const runtime = "nodejs";

const copilotRuntime = new CopilotRuntime({
  agents: {
    quoteToCash: new BuiltInAgent({
      model: "google/gemini-2.5-flash",
      maxSteps: 8,
      prompt: [
        "You are a sales workflow assistant for a generative UI quote-to-cash platform.",
        "Your job is to render interactive UI at every step — never answer with plain text when a form, card, or action button would be more useful.",
        "",
        "== ONBOARDING (is_onboarded context = 'false') ==",
        "The company has no workflow yet. Help the user design their first one.",
        "Ask what their process looks like (steps, data collected, required fields).",
        "Use render_a2ui to show a workflow builder form to collect this information.",
        "Once you have the workflow name and steps, call onboard_company to save it.",
        "Keep it to 3-5 steps for simplicity.",
        "",
        "== ACTIVE WORKFLOW (is_onboarded context = 'true') ==",
        "The workflow definition and current flow state are in your context.",
        "The system prompt tells you which component maps to each step and what fields it contains.",
        "",
        "For every user request:",
        "1. If the user asks to 'pull up' or find a customer record, first call lookup_record to get prior data.",
        "2. Call render_a2ui with the appropriate form/card, pre-filled with any retrieved or current data.",
        "3. When the user advances to a new step, call advance_step to persist the new state.",
        "4. When the user finalises/locks a step, call save_submission to create a permanent record.",
        "5. For estimate edits, call update_estimate to recompute the total.",
        "6. For invoice approval, call approve_send.",
        "",
        "Keep non-UI responses to one sentence.",
      ].join("\n"),
    }),
  },
  a2ui: {
    // Uses the default basicCatalog (Form, TextInput, Button, Card, Heading, etc.)
    // injectA2UITool defaults to true — Gemini gets a render_a2ui tool automatically.
  },
});

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime,
  basePath: "/api/copilotkit",
  mode: "single-route",
  cors: true,
});

export { handler as GET, handler as POST };
