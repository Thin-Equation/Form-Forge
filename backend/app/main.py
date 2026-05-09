"""
A2UI Quote-to-Cash — backend data API.

Endpoints
---------
GET  /company/{company_id}/status
POST /company/{company_id}/onboard

GET    /workflow/{company_id}                              list all workflows
POST   /workflow/{company_id}                              create workflow
GET    /workflow/{company_id}/{workflow_id}                get one
PUT    /workflow/{company_id}/{workflow_id}                update (full replace)
DELETE /workflow/{company_id}/{workflow_id}                delete
GET    /workflow/{company_id}/{workflow_id}/system-prompt  LLM context string

GET  /flow/{company_id}/{workflow_id}                      current flow state
POST /flow/{company_id}/{workflow_id}                      upsert flow state

POST  /submissions/{company_id}/{workflow_id}              save a completed step's form data
GET   /submissions/{company_id}/{workflow_id}              list all submissions (for dashboard)
GET   /submissions/{company_id}/{workflow_id}/lookup       find a specific record by step + search term

POST /actions/estimate-update
POST /actions/approve-send
"""
from __future__ import annotations

import uuid

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.flow import approve_send_once, recompute_estimate_total
from app.repo import (
    delete_flow,
    delete_workflow,
    get_flow,
    get_submissions,
    get_workflow,
    list_workflows,
    reserve_idempotency_key,
    save_submission,
    upsert_flow,
    upsert_workflow,
)
from app.schemas import (
    ApproveSendRequest,
    ApproveSendResponse,
    DEFAULT_WORKFLOW,
    EstimateUpdateRequest,
    EstimateUpdateResponse,
    FlowState,
    FlowStateResponse,
    OnboardingStatus,
    OnboardRequest,
    OnboardResponse,
    Workflow,
    WorkflowSummary,
)

app = FastAPI(title="A2UI Quote-to-Cash API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_workflow(company_id: str, workflow_id: str) -> Workflow:
    raw = get_workflow(company_id, workflow_id)
    if raw is None:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")
    return Workflow.model_validate(raw)


def _flow_response(company_id: str, workflow_id: str) -> FlowStateResponse:
    row = get_flow(company_id, workflow_id)
    return FlowStateResponse(company_id=company_id, workflow_id=workflow_id, **(row or {}))


# ---------------------------------------------------------------------------
# GET /company/{company_id}/status
# ---------------------------------------------------------------------------

@app.get("/company/{company_id}/status", response_model=OnboardingStatus)
def get_company_status(company_id: str) -> OnboardingStatus:
    """
    Routing gate on every app load.
    is_onboarded=False → show workflow + form builder.
    is_onboarded=True  → load the workflow list and jump into the active flow.
    """
    rows = list_workflows(company_id)
    if not rows:
        return OnboardingStatus(company_id=company_id, is_onboarded=False)

    summaries: list[WorkflowSummary] = []
    for row in rows:
        wf = Workflow.model_validate(row["workflow"])
        flow = get_flow(company_id, wf.workflow_id)
        summaries.append(WorkflowSummary(
            workflow_id=wf.workflow_id,
            name=wf.name,
            step_count=len(wf.steps),
            current_step=flow["step"] if flow else wf.steps[0].id,
        ))

    return OnboardingStatus(
        company_id=company_id,
        is_onboarded=True,
        workflows=summaries,
    )


# ---------------------------------------------------------------------------
# POST /company/{company_id}/onboard
# ---------------------------------------------------------------------------

@app.post("/company/{company_id}/onboard", response_model=OnboardResponse)
def onboard_company(company_id: str, body: OnboardRequest) -> OnboardResponse:
    """
    Saves the first workflow and initialises its flow state.
    Safe to call again — both writes are upserts.
    """
    wf = body.workflow
    upsert_workflow(company_id, wf.workflow_id, wf.model_dump())

    first = wf.steps[0]
    quote_id = f"Q-{company_id}"
    upsert_flow(company_id, wf.workflow_id, first.id, first.component, {}, quote_id)

    return OnboardResponse(
        workflow=wf,
        initial_flow=FlowStateResponse(
            company_id=company_id,
            workflow_id=wf.workflow_id,
            step=first.id,
            component=first.component,
            props={},
            quote_id=quote_id,
        ),
    )


# ---------------------------------------------------------------------------
# GET /workflow/{company_id}  — list
# ---------------------------------------------------------------------------

@app.get("/workflow/{company_id}", response_model=list[WorkflowSummary])
def list_company_workflows(company_id: str) -> list[WorkflowSummary]:
    rows = list_workflows(company_id)
    summaries = []
    for row in rows:
        wf = Workflow.model_validate(row["workflow"])
        flow = get_flow(company_id, wf.workflow_id)
        summaries.append(WorkflowSummary(
            workflow_id=wf.workflow_id,
            name=wf.name,
            step_count=len(wf.steps),
            current_step=flow["step"] if flow else None,
        ))
    return summaries


# ---------------------------------------------------------------------------
# POST /workflow/{company_id}  — create
# ---------------------------------------------------------------------------

@app.post("/workflow/{company_id}", response_model=Workflow, status_code=201)
def create_workflow(company_id: str, body: Workflow) -> Workflow:
    """
    Create a new workflow. The workflow_id inside the body is used as the key.
    Returns 409 if a workflow with that ID already exists.
    """
    if get_workflow(company_id, body.workflow_id) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Workflow '{body.workflow_id}' already exists. Use PUT to update.",
        )
    upsert_workflow(company_id, body.workflow_id, body.model_dump())
    return body


# ---------------------------------------------------------------------------
# GET /workflow/{company_id}/{workflow_id}
# ---------------------------------------------------------------------------

@app.get("/workflow/{company_id}/{workflow_id}", response_model=Workflow)
def get_one_workflow(company_id: str, workflow_id: str) -> Workflow:
    return _load_workflow(company_id, workflow_id)


# ---------------------------------------------------------------------------
# PUT /workflow/{company_id}/{workflow_id}  — full replace
# ---------------------------------------------------------------------------

@app.put("/workflow/{company_id}/{workflow_id}", response_model=Workflow)
def update_workflow(company_id: str, workflow_id: str, body: Workflow) -> Workflow:
    """
    Full replace of an existing workflow.
    The workflow_id in the URL is authoritative; body.workflow_id must match.
    """
    if body.workflow_id != workflow_id:
        raise HTTPException(
            status_code=422,
            detail="workflow_id in body must match the URL parameter.",
        )
    if get_workflow(company_id, workflow_id) is None:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")

    upsert_workflow(company_id, workflow_id, body.model_dump())
    return body


# ---------------------------------------------------------------------------
# DELETE /workflow/{company_id}/{workflow_id}
# ---------------------------------------------------------------------------

@app.delete("/workflow/{company_id}/{workflow_id}", status_code=204)
def remove_workflow(company_id: str, workflow_id: str) -> None:
    """
    Delete a workflow and its associated flow state.
    Returns 404 if the workflow does not exist.
    """
    if not delete_workflow(company_id, workflow_id):
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")
    delete_flow(company_id, workflow_id)


# ---------------------------------------------------------------------------
# GET /workflow/{company_id}/{workflow_id}/system-prompt
# ---------------------------------------------------------------------------

@app.get("/workflow/{company_id}/{workflow_id}/system-prompt", response_model=dict)
def get_system_prompt(company_id: str, workflow_id: str) -> dict:
    wf = _load_workflow(company_id, workflow_id)
    return {"system_prompt": wf.to_system_prompt()}


# ---------------------------------------------------------------------------
# GET /flow/{company_id}/{workflow_id}
# ---------------------------------------------------------------------------

@app.get("/flow/{company_id}/{workflow_id}", response_model=FlowStateResponse)
def get_flow_state(company_id: str, workflow_id: str) -> FlowStateResponse:
    wf = _load_workflow(company_id, workflow_id)
    row = get_flow(company_id, workflow_id)
    if row is None:
        first = wf.steps[0]
        return FlowStateResponse(
            company_id=company_id, workflow_id=workflow_id,
            step=first.id, component=first.component, props={}, quote_id="",
        )
    return FlowStateResponse(company_id=company_id, workflow_id=workflow_id, **row)


# ---------------------------------------------------------------------------
# PATCH /flow/{company_id}/{workflow_id}  — partial prop merge
# ---------------------------------------------------------------------------

@app.patch("/flow/{company_id}/{workflow_id}", response_model=FlowStateResponse)
def patch_flow_props(company_id: str, workflow_id: str, body: dict) -> FlowStateResponse:
    """
    Merge-patch the props of the current flow state.

    Only the keys present in *body* are updated; all other existing props are
    preserved.  This is the safe path for targeted field edits like:
      PATCH /flow/acme/wf-1  { "contact": "Sarah Chen" }
    without accidentally wiping deal_size, customer, etc.
    """
    row = get_flow(company_id, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No active flow for this company+workflow.")

    merged_props = {**row["props"], **body}
    upsert_flow(company_id, workflow_id, row["step"], row["component"],
                merged_props, row["quote_id"])
    return FlowStateResponse(company_id=company_id, workflow_id=workflow_id,
                             **get_flow(company_id, workflow_id))


# ---------------------------------------------------------------------------
# POST /flow/{company_id}/{workflow_id}
# ---------------------------------------------------------------------------

@app.post("/flow/{company_id}/{workflow_id}", response_model=FlowStateResponse)
def upsert_flow_state(company_id: str, workflow_id: str, body: FlowState) -> FlowStateResponse:
    """
    Called by the CopilotKit runtime after Gemini fires a render action.
    Validates the step exists in this workflow before persisting.
    """
    wf = _load_workflow(company_id, workflow_id)
    if body.step not in wf.step_ids():
        raise HTTPException(
            status_code=422,
            detail=f"Step '{body.step}' not in workflow. Valid: {wf.step_ids()}",
        )
    quote_id = body.quote_id or f"Q-{company_id}"
    upsert_flow(company_id, workflow_id, body.step, body.component, body.props, quote_id)
    return FlowStateResponse(company_id=company_id, workflow_id=workflow_id,
                             **get_flow(company_id, workflow_id))


# ---------------------------------------------------------------------------
# POST /submissions/{company_id}/{workflow_id}
# GET  /submissions/{company_id}/{workflow_id}
# ---------------------------------------------------------------------------

@app.post("/submissions/{company_id}/{workflow_id}", status_code=201)
def submit_step_data(company_id: str, workflow_id: str, body: dict) -> dict:
    """
    Persist a completed step's form data as an immutable submission record.
    Called when a user finalises a step (e.g. locks an estimate, sends an invoice).
    Returned records power the dynamic dashboard.
    """
    submission_id = str(uuid.uuid4())
    save_submission(
        company_id=company_id,
        workflow_id=workflow_id,
        submission_id=submission_id,
        data=body,
    )
    return {"submission_id": submission_id, **body}


@app.get("/submissions/{company_id}/{workflow_id}")
def list_submissions(
    company_id: str,
    workflow_id: str,
    step: str | None = Query(default=None, description="Filter by workflow step id"),
    search: str | None = Query(default=None, description="Substring match on data.customer"),
    limit: int = Query(default=50, le=200),
) -> list[dict]:
    """
    Return submissions newest-first.

    Optional filters:
      ?step=lead            only submissions for that step
      ?search=abc+corp      ilike match on the customer field
      ?limit=20             cap results (default 50, max 200)

    The CopilotKit runtime calls this to load prior data into Gemini context
    before answering "Pull up ABC Corp lead" type prompts.
    The dynamic dashboard uses this unfiltered to populate charts/tables.
    """
    return get_submissions(company_id, workflow_id, step=step, search=search, limit=limit)


@app.get("/submissions/{company_id}/{workflow_id}/lookup")
def lookup_submission(
    company_id: str,
    workflow_id: str,
    step: str = Query(..., description="Workflow step id to search within"),
    search: str = Query(..., description="Customer name to match"),
) -> dict:
    """
    Find the most recent submission matching *step* + *search*.

    Used by the CopilotKit runtime to load a specific record's data into
    Gemini context so targeted edits like "change ABC Corp contact to Sarah Chen"
    have the full existing props available.

    Returns 404 if no match found.
    """
    results = get_submissions(company_id, workflow_id, step=step, search=search, limit=1)
    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No {step} submission found matching '{search}'.",
        )
    return results[0]


# ---------------------------------------------------------------------------
# POST /actions/estimate-update
# ---------------------------------------------------------------------------

@app.post("/actions/estimate-update", response_model=EstimateUpdateResponse)
def estimate_update(req: EstimateUpdateRequest) -> EstimateUpdateResponse:
    items = [item.model_dump() for item in req.line_items]
    total = recompute_estimate_total(items)

    row = get_flow(req.company_id, req.workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No active flow for this company+workflow.")

    updated_props = {**row["props"], "line_items": items, "total": total}
    upsert_flow(req.company_id, req.workflow_id, row["step"], row["component"],
                updated_props, req.quote_id)

    return EstimateUpdateResponse(component=row["component"], step=row["step"], props=updated_props)


# ---------------------------------------------------------------------------
# POST /actions/approve-send
# ---------------------------------------------------------------------------

@app.post("/actions/approve-send", response_model=ApproveSendResponse)
def approve_send(req: ApproveSendRequest) -> ApproveSendResponse:
    key = req.idempotency_key or str(uuid.uuid4())
    sent = approve_send_once(invoice_id=req.invoice_id, key=key)
    return ApproveSendResponse(
        sent=sent,
        message="Invoice sent." if sent else "Duplicate request — already sent.",
    )
