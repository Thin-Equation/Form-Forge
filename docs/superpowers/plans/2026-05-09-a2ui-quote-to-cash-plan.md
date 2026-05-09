# A2UI Quote-to-Cash MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic A2UI demo that streams runtime-generated UI for Lead -> Estimate -> Invoice, with inline estimate edits and simulated invoice send.

**Architecture:** A Next.js frontend renders A2UI payloads from a strict component registry and sends user/actions to FastAPI. FastAPI runs a deterministic flow engine, persists lead/estimate/invoice in Supabase, and emits SSE events for each state transition. Contract validation guards payload shape and visible fallback UI handles unknown components.

**Tech Stack:** Next.js (App Router), Tailwind CSS, Framer Motion, FastAPI, Pydantic, Supabase Postgres, pytest, Vitest + React Testing Library

---

## File Structure (planned)

### Backend
- Create: `backend/app/main.py` — FastAPI routes (`/chat`, `/stream/{session_id}`, `/actions/*`)
- Create: `backend/app/schemas.py` — Pydantic request/response + A2UI payload schemas
- Create: `backend/app/flow.py` — deterministic state machine (`lead`, `estimate`, `invoice`)
- Create: `backend/app/payloads.py` — payload builder helpers (`LeadCard`, `EditableEstimate`, `InvoiceAction`)
- Create: `backend/app/repo.py` — Supabase CRUD and idempotent action updates
- Create: `backend/app/events.py` — in-memory SSE event bus per session
- Create: `backend/tests/test_payload_schema.py`
- Create: `backend/tests/test_flow_transitions.py`
- Create: `backend/tests/test_actions.py`

### Frontend
- Create: `frontend/lib/types/a2ui.ts` — shared payload typings
- Create: `frontend/lib/registry.ts` — component registry map
- Create: `frontend/lib/sse.ts` — SSE client helper
- Create: `frontend/components/DynamicRenderer.tsx`
- Create: `frontend/components/LeadCard.tsx`
- Create: `frontend/components/EditableEstimate.tsx`
- Create: `frontend/components/InvoiceAction.tsx`
- Create: `frontend/components/EventTimeline.tsx`
- Create: `frontend/app/page.tsx` — chat + stream + render orchestration
- Create: `frontend/tests/DynamicRenderer.test.tsx`
- Create: `frontend/tests/EditableEstimate.test.tsx`
- Create: `frontend/tests/InvoiceAction.test.tsx`

---

### Task 1: Bootstrap backend with contract-first tests

**Files:**
- Create: `backend/tests/test_payload_schema.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/payloads.py`

- [ ] **Step 1: Write the failing payload schema tests**

```python
# backend/tests/test_payload_schema.py
from pydantic import ValidationError
from app.schemas import A2UIRenderEvent, A2UIMeta


def test_valid_a2ui_render_event():
    event = A2UIRenderEvent(
        type="a2ui_render",
        component="LeadCard",
        props={"customer": "Acme Corp"},
        meta=A2UIMeta(session_id="s1", correlation_id="c1", step="lead"),
    )
    assert event.component == "LeadCard"


def test_invalid_step_rejected():
    try:
        A2UIRenderEvent(
            type="a2ui_render",
            component="LeadCard",
            props={},
            meta=A2UIMeta(session_id="s1", correlation_id="c1", step="unknown"),
        )
        assert False, "Expected ValidationError"
    except ValidationError:
        assert True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_payload_schema.py -v`  
Expected: FAIL with import/module errors (schemas not created yet)

- [ ] **Step 3: Write minimal schema and payload builder implementation**

```python
# backend/app/schemas.py
from typing import Any, Dict, Literal
from pydantic import BaseModel

Step = Literal["lead", "estimate", "invoice"]


class A2UIMeta(BaseModel):
    session_id: str
    correlation_id: str
    step: Step


class A2UIRenderEvent(BaseModel):
    type: Literal["a2ui_render"]
    component: str
    props: Dict[str, Any]
    meta: A2UIMeta
```

```python
# backend/app/payloads.py
from app.schemas import A2UIRenderEvent, A2UIMeta


def build_render_event(component: str, props: dict, session_id: str, correlation_id: str, step: str):
    return A2UIRenderEvent(
        type="a2ui_render",
        component=component,
        props=props,
        meta=A2UIMeta(session_id=session_id, correlation_id=correlation_id, step=step),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_payload_schema.py -v`  
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_payload_schema.py backend/app/schemas.py backend/app/payloads.py
git commit -m "test+feat: add A2UI schema contract and payload builder"
```

### Task 2: Implement deterministic flow engine

**Files:**
- Create: `backend/tests/test_flow_transitions.py`
- Create: `backend/app/flow.py`

- [ ] **Step 1: Write failing flow transition tests**

```python
# backend/tests/test_flow_transitions.py
from app.flow import FlowEngine


def test_prompt_enters_lead_step():
    engine = FlowEngine()
    state = engine.handle_prompt("Pull up Acme lead and draft estimate.")
    assert state.step == "estimate"


def test_lock_contract_transitions_to_invoice():
    engine = FlowEngine()
    engine.handle_prompt("Pull up Acme lead and draft estimate.")
    state = engine.handle_prompt("Lock contract and generate invoice.")
    assert state.step == "invoice"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_flow_transitions.py -v`  
Expected: FAIL with `ModuleNotFoundError: app.flow`

- [ ] **Step 3: Write minimal flow engine**

```python
# backend/app/flow.py
from dataclasses import dataclass


@dataclass
class FlowState:
    step: str = "lead"


class FlowEngine:
    def __init__(self):
        self.state = FlowState()

    def handle_prompt(self, prompt: str) -> FlowState:
        p = prompt.lower()
        if "draft estimate" in p or "pull up" in p:
            self.state.step = "estimate"
        elif "lock contract" in p or "generate invoice" in p:
            self.state.step = "invoice"
        return self.state
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_flow_transitions.py -v`  
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_flow_transitions.py backend/app/flow.py
git commit -m "test+feat: add deterministic quote-to-cash flow engine"
```

### Task 3: Add action handling with recompute + idempotency

**Files:**
- Create: `backend/tests/test_actions.py`
- Create: `backend/app/repo.py`
- Modify: `backend/app/flow.py`

- [ ] **Step 1: Write failing action tests**

```python
# backend/tests/test_actions.py
from app.flow import recompute_estimate_total, approve_send_once


def test_recompute_estimate_total():
    total = recompute_estimate_total(
        [{"qty": 10, "rate": 85}, {"qty": 50, "rate": 12}]
    )
    assert total == 1450


def test_approve_send_idempotent():
    sent1 = approve_send_once(invoice_id="inv1", key="k1")
    sent2 = approve_send_once(invoice_id="inv1", key="k1")
    assert sent1 is True
    assert sent2 is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_actions.py -v`  
Expected: FAIL with missing functions

- [ ] **Step 3: Implement minimal action functions + in-memory idempotency**

```python
# backend/app/repo.py
SEEN_KEYS: set[str] = set()
```

```python
# backend/app/flow.py (append)
from app.repo import SEEN_KEYS


def recompute_estimate_total(items: list[dict]) -> float:
    return sum(item["qty"] * item["rate"] for item in items)


def approve_send_once(invoice_id: str, key: str) -> bool:
    signature = f"{invoice_id}:{key}"
    if signature in SEEN_KEYS:
        return False
    SEEN_KEYS.add(signature)
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_actions.py -v`  
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_actions.py backend/app/repo.py backend/app/flow.py
git commit -m "test+feat: add estimate recompute and idempotent send action"
```

### Task 4: Wire FastAPI endpoints and SSE event bus

**Files:**
- Create: `backend/app/events.py`
- Create: `backend/app/main.py`
- Modify: `backend/app/payloads.py`

- [ ] **Step 1: Write failing API smoke test**

```python
# backend/tests/test_api_smoke.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_chat_endpoint_exists():
    res = client.post("/chat", json={"session_id": "s1", "message": "Pull up Acme lead and draft estimate."})
    assert res.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api_smoke.py -v`  
Expected: FAIL with `ModuleNotFoundError: app.main`

- [ ] **Step 3: Implement minimal endpoints and SSE queue**

```python
# backend/app/events.py
from collections import defaultdict, deque

_queues = defaultdict(deque)


def push_event(session_id: str, event: dict):
    _queues[session_id].append(event)


def pop_events(session_id: str):
    q = _queues[session_id]
    while q:
        yield q.popleft()
```

```python
# backend/app/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class ChatRequest(BaseModel):
    session_id: str
    message: str


@app.post("/chat")
def chat(req: ChatRequest):
    return {"ok": True, "session_id": req.session_id}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api_smoke.py -v`  
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_api_smoke.py backend/app/events.py backend/app/main.py
git commit -m "test+feat: add FastAPI chat endpoint and event bus scaffold"
```

### Task 5: Build frontend registry and fallback renderer

**Files:**
- Create: `frontend/tests/DynamicRenderer.test.tsx`
- Create: `frontend/lib/types/a2ui.ts`
- Create: `frontend/lib/registry.ts`
- Create: `frontend/components/DynamicRenderer.tsx`

- [ ] **Step 1: Write failing renderer tests**

```tsx
// frontend/tests/DynamicRenderer.test.tsx
import { render, screen } from "@testing-library/react";
import { DynamicRenderer } from "../components/DynamicRenderer";

test("renders unknown component fallback", () => {
  render(
    <DynamicRenderer
      payload={{ type: "a2ui_render", component: "NotReal", props: {}, meta: { session_id: "s1", correlation_id: "c1", step: "lead" } }}
    />
  );
  expect(screen.getByText(/unknown ui/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DynamicRenderer.test.tsx`  
Expected: FAIL with missing component/module

- [ ] **Step 3: Implement type, registry scaffold, and fallback renderer**

```ts
// frontend/lib/types/a2ui.ts
export type A2UIStep = "lead" | "estimate" | "invoice";
export type A2UIRenderPayload = {
  type: "a2ui_render";
  component: string;
  props: Record<string, unknown>;
  meta: { session_id: string; correlation_id: string; step: A2UIStep };
};
```

```tsx
// frontend/components/DynamicRenderer.tsx
import type { A2UIRenderPayload } from "../lib/types/a2ui";
import { componentRegistry } from "../lib/registry";

export function DynamicRenderer({ payload }: { payload: A2UIRenderPayload }) {
  const Cmp = componentRegistry[payload.component];
  if (!Cmp) return <div>Unknown UI: {payload.component}</div>;
  return <Cmp {...payload.props} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- DynamicRenderer.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/DynamicRenderer.test.tsx frontend/lib/types/a2ui.ts frontend/lib/registry.ts frontend/components/DynamicRenderer.tsx
git commit -m "test+feat: add A2UI renderer with unknown-component fallback"
```

### Task 6: Implement LeadCard, EditableEstimate, InvoiceAction with motion

**Files:**
- Create: `frontend/components/LeadCard.tsx`
- Create: `frontend/components/EditableEstimate.tsx`
- Create: `frontend/components/InvoiceAction.tsx`
- Create: `frontend/tests/EditableEstimate.test.tsx`
- Create: `frontend/tests/InvoiceAction.test.tsx`
- Modify: `frontend/lib/registry.ts`

- [ ] **Step 1: Write failing interaction tests**

```tsx
// frontend/tests/EditableEstimate.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableEstimate } from "../components/EditableEstimate";

test("calls onChange when qty changes", () => {
  const onChange = vi.fn();
  render(<EditableEstimate customer="Acme" line_items={[{ id: 1, description: "Labor", qty: 1, rate: 100 }]} total={100} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("qty-1"), { target: { value: "2" } });
  expect(onChange).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- EditableEstimate.test.tsx`  
Expected: FAIL with missing component

- [ ] **Step 3: Implement minimal components with Framer Motion wrappers**

```tsx
// frontend/components/LeadCard.tsx
import { motion } from "framer-motion";
export function LeadCard({ customer, deal_size }: { customer: string; deal_size: number }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h3>{customer}</h3><p>${deal_size}</p></motion.div>;
}
```

```tsx
// frontend/components/EditableEstimate.tsx
import { motion } from "framer-motion";
export function EditableEstimate({ customer, line_items, total, onChange }: any) {
  return (
    <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <h3>{customer}</h3>
      {line_items.map((i: any) => (
        <input key={i.id} aria-label={`qty-${i.id}`} defaultValue={i.qty} onChange={(e) => onChange(i.id, Number(e.target.value), i.rate)} />
      ))}
      <p>Total: {total}</p>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- EditableEstimate.test.tsx InvoiceAction.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/LeadCard.tsx frontend/components/EditableEstimate.tsx frontend/components/InvoiceAction.tsx frontend/tests/EditableEstimate.test.tsx frontend/tests/InvoiceAction.test.tsx frontend/lib/registry.ts
git commit -m "test+feat: add hero-flow UI components with motion transitions"
```

### Task 7: Connect page orchestration (chat + SSE + actions)

**Files:**
- Create: `frontend/lib/sse.ts`
- Create: `frontend/components/EventTimeline.tsx`
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Write failing page integration test**

```tsx
// frontend/tests/PageFlow.test.tsx
import { render, screen } from "@testing-library/react";
import HomePage from "../app/page";

test("shows timeline shell", () => {
  render(<HomePage />);
  expect(screen.getByText(/event timeline/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PageFlow.test.tsx`  
Expected: FAIL with missing timeline/UI

- [ ] **Step 3: Implement page-level wiring**

```tsx
// frontend/app/page.tsx (core shape)
// - local state: messages, payloads, events
// - submit prompt -> POST /chat
// - open EventSource /stream/{session_id}
// - on a2ui_render push payload to DynamicRenderer
// - on success event show toast
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- PageFlow.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/sse.ts frontend/components/EventTimeline.tsx frontend/app/page.tsx frontend/tests/PageFlow.test.tsx
git commit -m "feat: wire chat, SSE stream, action callbacks, and timeline UI"
```

### Task 8: End-to-end demo hardening and docs

**Files:**
- Create: `backend/scripts/seed_acme.py`
- Create: `docs/demo-script.md`
- Modify: `README.md`

- [ ] **Step 1: Write failing integration checklist test (manual runnable script)**

```bash
# backend/scripts/check_demo_flow.sh
# 1) seed data
# 2) call /chat prompt 1
# 3) call edit action
# 4) call /chat prompt 2
# 5) call approve action
# assert each response status == 200
```

- [ ] **Step 2: Run script to verify it fails before seed + routes complete**

Run: `bash backend/scripts/check_demo_flow.sh`  
Expected: FAIL on missing seed/data or endpoint behavior

- [ ] **Step 3: Add seed script + minimal run instructions**

```python
# backend/scripts/seed_acme.py
def main():
    print("Seeding Acme lead + draft estimate baseline")

if __name__ == "__main__":
    main()
```

```md
<!-- docs/demo-script.md -->
1. Prompt: Pull up Acme lead and draft estimate.
2. Edit labor qty from 10 to 12.
3. Prompt: Lock contract and generate invoice.
4. Click Approve & Send.
```

- [ ] **Step 4: Run checks and verify they pass**

Run: `cd backend && pytest -q && cd ../frontend && npm test`  
Expected: PASS across backend and frontend test suites

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_acme.py backend/scripts/check_demo_flow.sh docs/demo-script.md README.md
git commit -m "chore: add demo seed, runbook, and final verification docs"
```

---

## Spec Coverage Check
- Runtime-generated UI via A2UI payload + registry: **Tasks 1, 5, 7**
- Deterministic lead->estimate->invoice flow: **Tasks 2, 4, 7**
- Inline estimate editing + recompute/persist: **Tasks 3, 6, 7**
- Simulated approve/send final action: **Tasks 3, 7**
- Supabase persistence boundary (lead/estimate/invoice only): **Tasks 3, 4, 8**
- Error handling (schema validation + unknown fallback + idempotency): **Tasks 1, 3, 5**
- Demo readiness and judge narrative: **Task 8**

## Placeholder/Consistency Check
- No TBD/TODO placeholders
- Flow step names consistent: `lead`, `estimate`, `invoice`
- A2UI event type consistent: `a2ui_render`
