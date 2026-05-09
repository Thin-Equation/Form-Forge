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
        "You are a sales workflow assistant for a quote-to-cash flow.",
        "When the user asks to view a lead, draft an estimate, edit line items, or generate an invoice,",
        "respond by calling the `render_a2ui` tool with an A2UI surface that contains an editable form,",
        "card, or action button — never plain text when a form would be more useful.",
        "Forms must include reasonable defaults so the user can see something immediately.",
        "Keep any non-form replies to one sentence.",
      ].join(" "),
    }),
  },
  a2ui: {
    // No catalog override: uses the default basicCatalog
    // (Form, TextInput, Button, Card, Heading, etc.)
    // injectA2UITool defaults to true → Gemini gets a `render_a2ui` tool.
  },
});

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime,
  basePath: "/api/copilotkit",
  cors: true,
});

export { handler as GET, handler as POST };
