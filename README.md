# Form Forge — Generative Workflow UI

> **Generative UI Global Hackathon — Track 1: Kill the Dashboard.**
> A sales-ops agent that responds to user requests by mutating editable forms it generates at runtime, instead of static dashboard pages.

---

## 1. The 60-second pitch (for judges)

Most sales tools ship a fixed set of forms — a Lead page, an Estimate page, an Invoice page — and the user clicks between them. **We deleted those pages.**

Instead, every company configures a *workflow* (lead → estimate → invoice, or whatever shape they need), and a Gemini-backed agent generates the right editable form on demand. Ask "draft an estimate for ABC Corp" and you get a real, editable, line-item table — not a chat reply describing one. Edit a row directly in the table, and the change persists through the backend. Click **Approve & Send** and an idempotency-keyed invoice fires.

**Why this couldn't be a chatbot:**

- There is no chat thread visible to the user. The UI is a form — fields, tables, buttons — not a conversation log.
- The form structure is generated at runtime from the workflow definition. No React component is hand-written for any specific company's lead form. A new company describes their process in plain English, the agent calls `onboard_company`, and the same `GenerativeForm` component renders fields it has never seen before.
- Two companies with different workflow configs see *different* forms from the same codebase, because the fields Gemini invented for each are different.

**Protocols / sponsors used:**

- **CopilotKit** AG-UI runtime — SSE agent loop, `useAgentContext`, `useFrontendTool`
- **Gemini 2.5 Flash** as the LLM via `BuiltInAgent` (Google AI Studio)
- **Supabase** for workflow + flow + submission storage

---

## 2. What you actually see in the demo

1. Open `http://localhost:3000/?co=acme-co` — the page hydrates the company's workflow and current flow state from the backend. The **Lead Review** form renders immediately with editable fields.
2. Type `"Pull up the ACME lead and draft an estimate"` in the command bar at the top.
3. Gemini calls `lookup_record` (finds or creates the ACME lead), then `advance_step` to move to the estimate step — the **Draft Estimate** form replaces the lead form, line-item table included.
4. Edit a line item's quantity directly in the table. On blur, `update_estimate` fires: the change POSTs to the Python backend, total is recomputed in cents-clean Decimal math, persisted, and the table refreshes with the new total.
5. Click **Save & continue → Generate Invoice** (or type `"generate the invoice"`). The **Generate Invoice** form appears.
6. Click **Approve & send invoice**. The backend reserves an idempotency key and returns `sent: true`. Click again: `sent: false, message: "Already sent"`.

The same form surface, three completely different form shapes, all driven by the agent at runtime.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser                                                           │
│                                                                    │
│  ┌──────────────────────────────┐   ┌────────────────────────────┐ │
│  │ <WorkflowSurface>            │   │ <CompanyProvider>          │ │
│  │  ↳ <CommandBar>  (input)     │   │  hydrates from /company,   │ │
│  │  ↳ <Stepper>     (nav)       │   │  /workflow, /flow on mount │ │
│  │  ↳ <GenerativeForm> (fields) │   └────────────────────────────┘ │
│  │  ↳ <LineItemsEditor> (table) │                                  │
│  │  ↳ <ApproveSendButton>       │                                  │
│  │                              │                                  │
│  │ <AgentRuntime>  (no UI)      │                                  │
│  │  ↳ useAgentContext × 5       │                                  │
│  │  ↳ useFrontendTool:          │                                  │
│  │     onboard_company          │                                  │
│  │     advance_step             │                                  │
│  │     save_submission          │                                  │
│  │     lookup_record            │                                  │
│  │     update_estimate          │                                  │
│  │     approve_send             │                                  │
│  └──────────────┬───────────────┘                                  │
│                 │ AG-UI events over SSE                            │
└─────────────────┼──────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js API route  /api/copilotkit/[[...path]]                 │
│  ────────────────────────────────────────────────────────────── │
│  CopilotRuntime (v2) with:                                      │
│    • BuiltInAgent  → google/gemini-2.5-flash                    │
│    • System prompt with tool-use rules (no render_a2ui)         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼ Gemini 2.5 Flash
                                (Google AI Studio)

              ┌──────────────────────────────────────┐
              │ FastAPI backend  :8000               │
              │ ──────────────────────────────────── │
              │ /company/{id}/status     ← FE on load │
              │ /company/{id}/onboard    ← first setup │
              │ /workflow/{id}/{wf}      ← definition  │
              │ /flow/{id}/{wf}          ← step state  │
              │ /actions/estimate-update ← line edits  │
              │ /actions/approve-send    ← approvals   │
              │ /submissions/...         ← history     │
              └──────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────────────┐
              │ Supabase (Postgres)                  │
              │   company_workflows                  │
              │   company_flows                      │
              │   form_submissions                   │
              │   idempotency_keys                   │
              └──────────────────────────────────────┘
```

### How a single user prompt flows end-to-end

1. **User types** in `<CommandBar>`. The input is never disabled — you can compose the next message while the agent is running.
2. `CommandBar` adds the message to the agent and calls `copilotkit.runAgent()`, which opens an SSE connection to `/api/copilotkit`.
3. The Next.js runtime calls Gemini through `BuiltInAgent`, injecting five agent context values: `company_id`, `is_onboarded`, workflow JSON, system prompt, and current flow state.
4. Gemini calls one of the six frontend tools (e.g. `lookup_record`, then `advance_step`).
5. The tool handler runs in the browser: it calls the Python REST API, awaits the response, then calls `refreshFlow()`.
6. `refreshFlow()` re-fetches `/flow/{co}/{wf}` → `CompanyProvider` updates → `GenerativeForm` re-renders with the new step and props.
7. Gemini replies with at most one sentence of plain text, shown as a muted italic line below the input.

---

## 4. Repo layout

```
.
├── README.md                      ← you are here
├── frontend/                      ← Next.js 16 + TypeScript + Tailwind v4
│   ├── app/
│   │   ├── api/copilotkit/[[...path]]/route.ts   ← CopilotKit runtime + Gemini
│   │   ├── layout.tsx             ← glassmorphism background + metadata
│   │   ├── page.tsx               ← Header, CompanyProvider, WorkflowSurface
│   │   └── providers.tsx          ← <CopilotKit> provider
│   ├── components/
│   │   ├── AgentRuntime.tsx       ← useAgentContext + all useFrontendTool registrations
│   │   ├── WorkflowSurface.tsx    ← top-level layout (CommandBar + Stepper + form)
│   │   ├── CommandBar.tsx         ← command input, suggestions, agent reply line
│   │   ├── Stepper.tsx            ← clickable step navigation
│   │   ├── GenerativeForm.tsx     ← renders workflow fields from flow state
│   │   ├── LineItemsEditor.tsx    ← editable line-item table for estimate step
│   │   └── ApproveSendButton.tsx  ← idempotent invoice send button
│   ├── lib/
│   │   ├── api.ts                 ← typed REST client (mirrors backend/app/schemas.py)
│   │   └── CompanyContext.tsx     ← mount-time hydration + React context
│   ├── tests/                     ← Vitest + React Testing Library
│   └── .env.local.example
├── backend/                       ← FastAPI + Supabase
│   ├── app/
│   │   ├── main.py                ← all REST routes
│   │   ├── schemas.py             ← Pydantic models (source of truth)
│   │   ├── flow.py                ← estimate math + idempotent send
│   │   └── repo.py                ← Supabase persistence
│   ├── tests/                     ← pytest
│   ├── pyproject.toml             ← uv-managed
│   └── .env.example
├── supabase/migrations/           ← run in order, 001 → 002 → 003
│   ├── 001_init.sql
│   ├── 002_company_workflows.sql
│   └── 003_multi_workflow.sql
└── docs/
    └── superpowers/               ← original spec + plan from /specs phase
```

---

## 5. Tech stack

| Layer          | Tech                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| Frontend       | Next.js 16 (App Router, Turbopack), React 19.2, TypeScript, Tailwind v4           |
| Agent runtime  | `@copilotkit/runtime` v1.57 (v2 entry), `@copilotkit/react-core` v2, `@ag-ui/client` |
| LLM            | Google Gemini 2.5 Flash via `BuiltInAgent` (Google AI Studio)                     |
| Backend        | FastAPI, Pydantic v2, Python 3.12+, [`uv`](https://docs.astral.sh/uv/) for deps   |
| Database       | Supabase (Postgres + RLS)                                                         |
| Tests          | Vitest + React Testing Library (frontend), pytest + httpx (backend)               |

---

## 6. Running locally — full setup

You'll set up three things in order: **Supabase**, **backend**, **frontend**.

### 6.1 Supabase

1. Create a free Supabase project at <https://supabase.com>.
2. In the project dashboard, open **SQL Editor** and run each migration in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_company_workflows.sql`
   - `supabase/migrations/003_multi_workflow.sql`
3. Copy two values from **Project Settings → API**:
   - **Project URL** (e.g. `https://abcdefg.supabase.co`)
   - **service_role secret** (starts with `eyJ…`, never expose to the browser)

> Migrations are idempotent — safe to re-run. Migration 003 drops and recreates the workflow + flow tables; data from 001/002 is wiped, which is fine for a fresh checkout.

### 6.2 Backend (FastAPI)

Requires Python 3.12+ and [`uv`](https://docs.astral.sh/uv/getting-started/installation/).

```bash
cd backend
cp .env.example .env
# open .env and paste in:
#   SUPABASE_URL=https://abcdefg.supabase.co
#   SUPABASE_KEY=eyJ…service_role…

uv sync                                   # install deps into .venv
uv run uvicorn app.main:app --reload --port 8000 --env-file .env
```

Smoke test:

```bash
curl http://localhost:8000/company/acme-co/status
# → {"company_id":"acme-co","is_onboarded":false,"workflows":[]}
```

Seed the demo company with the default Quote-to-Cash workflow (lead → estimate → invoice):

```bash
curl -X POST http://localhost:8000/company/acme-co/onboard \
  -H "content-type: application/json" \
  -d "$(uv run python -c 'from app.schemas import DEFAULT_WORKFLOW; import json; print(json.dumps({"workflow": DEFAULT_WORKFLOW.model_dump()}))')"
```

Run the backend test suite:

```bash
uv run pytest
```

### 6.3 Frontend (Next.js)

Requires Node.js 20.9+ and npm.

```bash
cd frontend
cp .env.local.example .env.local
# open .env.local and paste in:
#   GOOGLE_API_KEY=AIza…   (from https://aistudio.google.com/apikey)
#   NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

npm install
npm run dev
```

Open <http://localhost:3000/?co=acme-co> in your browser.

If `acme-co` is onboarded (you ran the seed step above), the Lead Review form renders immediately. If not, you'll see a "No workflow yet" panel — type a description of your process in the command bar and the agent will build the workflow for you.

Run the frontend test suite + typecheck:

```bash
npm test                # vitest, runs all tests/*.test.tsx
npx tsc --noEmit        # type check the project
```

### 6.4 Env-var quick reference

| Variable                  | Where                 | Required | Notes                                            |
| ------------------------- | --------------------- | -------- | ------------------------------------------------ |
| `SUPABASE_URL`            | `backend/.env`        | yes      | Project URL                                      |
| `SUPABASE_KEY`            | `backend/.env`        | yes      | service_role key — server only                   |
| `GOOGLE_API_KEY`          | `frontend/.env.local` | yes      | AI Studio key, read by `BuiltInAgent` at runtime |
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/.env.local` | no       | Defaults to `http://localhost:8000`              |

---

## 7. API reference

| Method | Path                                                  | Purpose                                                                  |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/company/{company_id}/status`                        | Onboarding gate. Called on every page load.                              |
| POST   | `/company/{company_id}/onboard`                       | Save the first workflow + initialise its flow.                           |
| GET    | `/workflow/{company_id}`                              | List all workflows configured for the company.                           |
| POST   | `/workflow/{company_id}`                              | Create a new workflow (409 if `workflow_id` already exists).             |
| GET    | `/workflow/{company_id}/{workflow_id}`                | Fetch one workflow.                                                      |
| PUT    | `/workflow/{company_id}/{workflow_id}`                | Full replace.                                                            |
| DELETE | `/workflow/{company_id}/{workflow_id}`                | Remove workflow + its flow state.                                        |
| GET    | `/workflow/{company_id}/{workflow_id}/system-prompt`  | LLM context string built from the workflow definition.                   |
| GET    | `/flow/{company_id}/{workflow_id}`                    | Current step + component + props + quote_id.                             |
| POST   | `/flow/{company_id}/{workflow_id}`                    | Upsert flow state (full replace of the row).                             |
| PATCH  | `/flow/{company_id}/{workflow_id}`                    | Merge-patch only the keys you provide; preserves other props.            |
| POST   | `/submissions/{company_id}/{workflow_id}`             | Persist a completed step's form data (immutable record).                 |
| GET    | `/submissions/{company_id}/{workflow_id}`             | List submissions newest-first; supports `?step=`, `?search=`, `?limit=`. |
| GET    | `/submissions/{company_id}/{workflow_id}/lookup`      | Find the most recent submission matching `?step=&search=`.               |
| POST   | `/actions/estimate-update`                            | Recompute total + persist line items. Called by `update_estimate` tool.  |
| POST   | `/actions/approve-send`                               | Idempotent invoice send. Called by `approve_send` tool.                  |

Full Pydantic schemas live in `backend/app/schemas.py`; the TypeScript mirror is `frontend/lib/api.ts`.

---

## 8. How the frontend connects to the agent

The mental model: **CopilotKit is the LLM-side runtime, the Python backend is the data-side runtime, and they don't talk to each other.** The frontend bridges them.

| Concern                                     | Owned by                                    |
| ------------------------------------------- | ------------------------------------------- |
| Command input + LLM call                    | `CommandBar` → CopilotKit runtime → Gemini  |
| Form rendering                              | `GenerativeForm` reads `workflow` + `flow` from context |
| Workflow config / flow state / submissions  | Python FastAPI + Supabase                   |
| User actions (field edit, line item, approve) | Field blur / button click → Python REST   |
| Agent actions (advance step, lookup, send)  | `AgentRuntime` frontend tools → Python REST |

Key separation:

- The Python backend doesn't know Gemini exists. It's a plain CRUD API.
- Gemini doesn't know Supabase exists. It sees a system prompt + flow JSON via `useAgentContext`, and six frontend tools it can call.
- The frontend is the integration layer. `lib/CompanyContext.tsx` does the hydration; `components/AgentRuntime.tsx` registers all tools and glues them to REST calls.

If you want to add a new action (say, `revert_to_step`), you write it in three places:

1. Add the REST endpoint in `backend/app/main.py` + request/response models in `schemas.py`.
2. Add a typed wrapper in `frontend/lib/api.ts`.
3. Register it via `useFrontendTool` in `components/AgentRuntime.tsx` with a Zod parameters schema and a handler that calls #2 and `refreshFlow()`.

---

## 9. Verifying the demo flow

After both servers are running and `acme-co` is onboarded, the happy path:

```text
Open: http://localhost:3000/?co=acme-co
→ Lead Review form renders with empty fields (step: lead)

Type: "pull up the ACME lead and draft an estimate"
→ Agent calls lookup_record (step=lead, customer=acme)
→ Agent calls advance_step → Lead Review fields populate
→ Step advances to Draft Estimate, line-item table appears

Edit a line item qty directly in the table
→ update_estimate fires on blur → total recomputes → table refreshes

Click "Save & continue → Generate Invoice"  (or type "generate the invoice")
→ Generate Invoice form appears with invoice fields

Click "Approve & send invoice"
→ approve_send fires → sent: true
Click again
→ sent: false, message: "Already sent"  (idempotency key reuse)
```

The two REST actions show up in the FastAPI log:

```
POST /actions/estimate-update HTTP/1.1 200
POST /actions/approve-send    HTTP/1.1 200
```

**Testing the onboarding flow** (fresh company):

```text
Open: http://localhost:3000/?co=fresh-brand
→ "No workflow yet" glass card shown

Type: "Set up a 3-step SaaS workflow: prospect intake, pricing proposal, contract sign-off"
→ Agent calls onboard_company with Gemini-invented fields for each step
→ Workflow saved to Supabase → form appears with the new step structure
```

---

## 10. Troubleshooting

| Symptom                                             | Likely cause / fix                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend shows "Couldn't reach the backend"         | FastAPI isn't running, or `NEXT_PUBLIC_BACKEND_URL` doesn't match. CORS is permissive (`*`) so that's not the issue.    |
| Command bar shows "Thinking…" but nothing happens   | `GOOGLE_API_KEY` not set, key invalid, or quota exhausted. Check `aistudio.google.com/apikey`.                          |
| "No workflow yet" never goes away after describing process | Agent didn't call `onboard_company` — try being more explicit: *"Create a workflow called X with steps Y and Z"*. |
| Form fields don't save on blur                      | Backend not reachable, or `activeWorkflowId` is null (check the step badge in the header).                              |
| `KeyError: SUPABASE_URL` from the backend           | `backend/.env` not loaded. Add `--env-file .env` to the uvicorn command.                                                |
| Dev server dies on env reload                       | Known Next 16 quirk — restart with `npm run dev`. Code edits keep working via HMR; only env changes require a boot.    |

---

## 11. What we deliberately scoped out

- Authentication. Every request is implicitly the service role.
- Multi-user concurrency on the same flow row (last write wins).
- Real email/payment integration for `approve_send` — it just reserves an idempotency key and returns `sent: true`.
- A visual workflow editor. Workflows are created by describing them to the agent; a future iteration would render a form-builder using the same `GenerativeForm` component.

---

## 12. Credits

- **CopilotKit** for the AG-UI runtime stack.
- **Google Gemini** for the LLM.
- **Supabase** for free Postgres + RLS.
- **AI Tinkerers** for organising the Generative UI Global Hackathon.
