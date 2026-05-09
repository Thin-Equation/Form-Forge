# A2UI Generative UI — Backend Design (current as of 2026-05-09)

## What We're Building

A backend data service for a multi-tenant generative-UI platform where:
- Companies configure their own **workflows** (step sequences) and **forms** (field definitions) at signup.
- All users of the same company share the same deterministic flow state.
- A CopilotKit + Gemini frontend renders the right UI at runtime based on what the backend serves — no hardcoded screens.

---

## Architecture

```
Browser
  ↕  (CopilotKit React hooks)
Next.js  ← CopilotRuntime + Gemini (LLM lives here)
  ↕  HTTP
FastAPI  ← this repo (pure data service, no LLM)
  ↕
Supabase Postgres
```

The LLM (Gemini) and AG-UI streaming live entirely in Next.js/CopilotKit.
FastAPI owns persistence, workflow config, and business-logic actions only.

---

## Database Schema (Supabase)

### `company_workflows`  PK `(company_id, workflow_id)`
Stores workflow configs as JSONB. One company can have many workflows.

### `company_flows`  PK `(company_id, workflow_id)`
Current active flow state per company+workflow. All users of the same company
see the same row — this is the shared deterministic state.

### `form_submissions`  PK `id` (BIGSERIAL)
Immutable append-only records written whenever a user finalises a step.
Powers the dynamic dashboard without extra persistence.

### `idempotency_keys`  PK `(invoice_id, key)`
Prevents duplicate approve-and-send operations.

---

## Workflow & Form Schema

```json
{
  "workflow_id": "field-service-v1",
  "name": "Field Service",
  "steps": [
    {
      "id": "lead",
      "name": "Lead Review",
      "component": "LeadCard",
      "description": "Show lead or prospect info",
      "transitions": ["survey"],
      "fields": [
        { "key": "customer",  "label": "Customer Name", "type": "text",   "required": true },
        { "key": "deal_size", "label": "Deal Size ($)", "type": "number", "required": true }
      ]
    },
    {
      "id": "survey",
      "name": "Site Survey",
      "component": "SiteSurveyForm",
      "description": "Record site survey results",
      "transitions": ["estimate"],
      "fields": [
        { "key": "location", "label": "Site Address", "type": "text",     "required": true },
        { "key": "notes",    "label": "Notes",        "type": "textarea"                   }
      ]
    }
  ]
}
```

**Supported field types:** `text`, `number`, `select`, `date`, `textarea`, `checkbox`

The `description` on each step is injected into the Gemini system prompt so the
LLM knows which render function to call and what props to pre-fill.

---

## API Reference

### Onboarding

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/company/{id}/status` | `is_onboarded` flag + workflow list. Frontend routing gate on every load. |
| POST | `/company/{id}/onboard` | Save first workflow + initialise flow to step[0]. Called once on signup completion. |

### Workflow CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/workflow/{company_id}` | List all workflows (summary — id, name, step_count, current_step) |
| POST   | `/workflow/{company_id}` | Create new workflow (409 if workflow_id already exists) |
| GET    | `/workflow/{company_id}/{workflow_id}` | Full workflow detail |
| PUT    | `/workflow/{company_id}/{workflow_id}` | Full replace |
| DELETE | `/workflow/{company_id}/{workflow_id}` | Delete workflow + its flow state |
| GET    | `/workflow/{company_id}/{workflow_id}/system-prompt` | LLM-ready description string for CopilotKit |

### Flow State

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/flow/{company_id}/{workflow_id}` | Current shared flow state |
| POST | `/flow/{company_id}/{workflow_id}` | Upsert (step validated against workflow) |

### Submissions (dashboard data)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/submissions/{company_id}/{workflow_id}` | Save a finalised step's form data |
| GET  | `/submissions/{company_id}/{workflow_id}` | List all submissions, newest first |

### Actions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/actions/estimate-update` | Recompute line-item total, persist |
| POST | `/actions/approve-send`    | Idempotent invoice send simulation |

---

## App Flow (Phase 1)

### Signup (new company)
1. Frontend calls `GET /company/{id}/status` → `{ is_onboarded: false }`
2. Shows workflow builder + form builder UI
3. User configures steps and form fields
4. Frontend calls `POST /company/{id}/onboard` with the workflow
5. Backend saves workflow + initialises flow state
6. Frontend redirects to the active flow

### Signin (returning company)
1. Frontend calls `GET /company/{id}/status` → `{ is_onboarded: true, workflows: [...] }`
2. Loads `GET /workflow/{id}/{wf_id}/system-prompt` → injects into Gemini
3. Loads `GET /flow/{id}/{wf_id}` → shows current state immediately
4. User continues from where the company left off

### Workflow Management (post-onboarding)
- Create additional workflows: `POST /workflow/{id}`
- Edit existing: `PUT /workflow/{id}/{wf_id}`
- Delete: `DELETE /workflow/{id}/{wf_id}`

### Runtime (per user message)
1. User sends message → CopilotKit calls Gemini with system prompt
2. Gemini fires `render_<component>` tool call
3. CopilotKit calls `POST /flow/{id}/{wf_id}` to persist new state
4. All other company users see the update on their next `GET /flow`

---

## Phase 2 (if time permits)
- Dynamic dashboard: frontend reads `GET /submissions/{id}/{wf_id}` and renders
  charts/tables. No new backend work needed — the data is already persisted.

---

## Tech Stack
- **Runtime:** FastAPI + Uvicorn, Python 3.12+
- **Package manager:** uv
- **Persistence:** Supabase Postgres (supabase-py)
- **Validation:** Pydantic v2
- **Tests:** pytest (41 tests, all passing)
- **Env vars required:** `SUPABASE_URL`, `SUPABASE_KEY`
