# A2UI Track 1 Design — Quote-to-Cash Hero Flow

## Problem and Goal
Build a hackathon-ready generative UI prototype for **Track 1 (Kill the Dashboard)** using **A2UI**.  
The demo must prove that an agent can generate the right interface at runtime, replacing static module dashboards.

Primary success criterion: **clear runtime-generated UI transitions** across the flow.

## Scope (In)
- Single hero workflow: **Lead -> Estimate -> Invoice**
- Domain focus for MVP persistence: **lead, estimate, invoice**
- Runtime-generated components via A2UI payloads
- Interactive inline estimate editing
- Final invoice approve/send as **simulated send** (status update + toast)

## Scope (Out)
- Full ERP module buildout (HR, dispatch suite, full accounting suite)
- Real email/API invoice sending
- Multi-tenant auth hardening
- Broad schema coverage beyond hero flow entities

## Chosen Approach
**Deterministic A2UI State Machine** (recommended and selected).

Why:
- Fastest to ship inside six-hour constraints
- Lowest runtime failure risk for live demo
- Clear architecture story for judges

Trade-off:
- Less open-ended than fully LLM-driven dynamic planning, but much more reliable.

## Architecture
### Frontend
- **Next.js + Tailwind + Framer Motion**
- Sends user prompts to backend `/chat`
- Subscribes to backend SSE endpoint `/stream/{session_id}`
- Renders A2UI payloads through a strict component registry

### Backend
- **FastAPI** as agent gateway and flow orchestrator
- Deterministic `FlowEngine` for `lead -> estimate -> invoice`
- Callback endpoint `/actions` for UI interactions (estimate edits, final approve/send)
- **Supabase Postgres** persistence for only lead/estimate/invoice entities

### Protocol contract
Single A2UI payload shape:

```json
{
  "type": "a2ui_render",
  "component": "EditableEstimate",
  "props": {},
  "meta": {
    "session_id": "string",
    "correlation_id": "string",
    "step": "lead|estimate|invoice"
  }
}
```

## Component and Service Boundaries
### Frontend units
1. `DynamicRenderer` — maps payload `component` to React component
2. `LeadCard` — shows lead/account context
3. `EditableEstimate` — editable line-item table with computed totals
4. `InvoiceAction` — approval/send surface
5. `EventTimeline` — lightweight stream/debug panel for demo narration

### Backend units
1. `SessionController` — prompt/session lifecycle handling
2. `FlowEngine` — deterministic state transitions
3. `PayloadBuilder` — schema-safe payload creation
4. `ActionHandler` — handles estimate edit and approve/send callbacks
5. `Repo` — Supabase CRUD for lead/estimate/invoice

## End-to-End Data Flow
1. User prompt: "Pull up Acme lead and draft estimate."
2. `/chat` creates/updates session and triggers `FlowEngine`.
3. Engine loads lead, creates draft estimate totals, persists draft.
4. SSE emits `LeadCard` render payload.
5. SSE emits `EditableEstimate` render payload.
6. User edits qty/rate inline.
7. Frontend posts edit event to `/actions/estimate-update`.
8. Backend recomputes totals, persists, and emits refreshed `EditableEstimate`.
9. User prompt: "Lock contract and generate invoice."
10. Engine creates invoice record and emits `InvoiceAction`.
11. User clicks approve/send.
12. Backend simulates send, updates invoice status, emits success event + toast payload.

## Error Handling and Reliability
- Validate every outbound A2UI payload against schema before SSE emit.
- Unknown `component` must render a visible fallback error card with correlation ID.
- Supabase write/read failures surface as actionable inline retry plus toast.
- Final approve/send uses idempotency key to prevent duplicate simulated sends.
- SSE reconnect path recovers visible state after transient disconnect.

## Testing and Demo Readiness
### Backend tests
- Payload contract tests (required fields/types)
- Flow transition tests (`lead -> estimate -> invoice`)
- Action handler tests for recompute + persistence

### Frontend tests
- Renderer behavior for known and unknown components
- Edit callback wiring from `EditableEstimate`
- Final action wiring from `InvoiceAction`

### Integration/demo checks
- Seed Acme lead once
- Run one scripted happy-path from prompt to send simulation
- Verify visible runtime transitions at each major step

## Demo Script (Judging-Focused)
1. Prompt 1: pull Acme lead + draft estimate -> two generated UI surfaces appear.
2. Edit labor/material rows inline -> totals update in-place and rerender.
3. Prompt 2: lock contract + generate invoice -> invoice action card appears.
4. Approve/send -> success confirmation and status transition.

This script demonstrates that the user does not navigate prebuilt dashboards; the agent renders the exact UI needed at runtime.

## Implementation Notes
- Keep seed data small and deterministic for reliability.
- Use Framer Motion transitions only at key state boundaries to avoid animation noise.
- Favor explicit state enums over implicit text parsing for flow transitions.
- Keep all non-hero modules out of MVP.
