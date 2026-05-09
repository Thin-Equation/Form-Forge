"""FastAPI endpoint tests — all Supabase calls mocked."""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import DEFAULT_WORKFLOW

client = TestClient(app)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_WF_ID = "field-service"

_CUSTOM_WF = {
    "workflow_id": _WF_ID,
    "name": "Field Service",
    "steps": [
        {"id": "lead",     "name": "Lead",     "component": "LeadCard",         "description": "d", "transitions": ["survey"],   "fields": []},
        {"id": "survey",   "name": "Survey",   "component": "SiteSurveyForm",   "description": "d", "transitions": ["estimate"], "fields": []},
        {"id": "estimate", "name": "Estimate", "component": "EditableEstimate", "description": "d", "transitions": ["invoice"],  "fields": []},
        {"id": "invoice",  "name": "Invoice",  "component": "InvoiceAction",    "description": "d", "transitions": [],           "fields": []},
    ],
}

_FLOW = {
    "step": "estimate", "component": "EditableEstimate",
    "props": {"customer": "Acme", "estimate_id": "E-1",
              "line_items": [{"id": 1, "description": "Labor", "qty": 10, "rate": 85}],
              "total": 850.0},
    "quote_id": "Q-acme", "updated_at": "2026-05-09T10:00:00",
}

_WF_ROW = {"workflow_id": _WF_ID, "workflow": _CUSTOM_WF, "updated_at": "2026-05-09T10:00:00"}


# ---------------------------------------------------------------------------
# GET /company/{id}/status
# ---------------------------------------------------------------------------

@patch("app.main.list_workflows", return_value=[])
def test_status_not_onboarded(mock_list) -> None:
    res = client.get("/company/new-co/status")
    assert res.status_code == 200
    assert res.json()["is_onboarded"] is False
    assert res.json()["workflows"] == []


@patch("app.main.get_flow", return_value=_FLOW)
@patch("app.main.list_workflows", return_value=[_WF_ROW])
def test_status_onboarded(mock_list, mock_flow) -> None:
    res = client.get("/company/acme/status")
    data = res.json()
    assert data["is_onboarded"] is True
    assert data["workflows"][0]["workflow_id"] == _WF_ID
    assert data["workflows"][0]["current_step"] == "estimate"


# ---------------------------------------------------------------------------
# POST /company/{id}/onboard
# ---------------------------------------------------------------------------

@patch("app.main.upsert_flow")
@patch("app.main.upsert_workflow")
def test_onboard_initialises_first_step(mock_wf, mock_flow) -> None:
    res = client.post("/company/acme/onboard", json={"workflow": _CUSTOM_WF})
    assert res.status_code == 200
    mock_wf.assert_called_once()
    # upsert_flow called with positional args: (company_id, workflow_id, step, ...)
    assert mock_flow.call_args.args[2] == "lead"
    assert res.json()["initial_flow"]["step"] == "lead"


def test_onboard_rejects_bad_transitions() -> None:
    bad = {**_CUSTOM_WF, "steps": [
        {"id": "x", "name": "X", "component": "C",
         "description": "d", "transitions": ["ghost"], "fields": []},
    ]}
    res = client.post("/company/acme/onboard", json={"workflow": bad})
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# GET /workflow/{id}  — list
# ---------------------------------------------------------------------------

@patch("app.main.get_flow", return_value=None)
@patch("app.main.list_workflows", return_value=[_WF_ROW])
def test_list_workflows(mock_list, mock_flow) -> None:
    res = client.get("/workflow/acme")
    assert res.status_code == 200
    assert res.json()[0]["workflow_id"] == _WF_ID
    assert res.json()[0]["step_count"] == 4


# ---------------------------------------------------------------------------
# POST /workflow/{id}  — create
# ---------------------------------------------------------------------------

@patch("app.main.upsert_workflow")
@patch("app.main.get_workflow", return_value=None)
def test_create_workflow(mock_get, mock_upsert) -> None:
    res = client.post("/workflow/acme", json=_CUSTOM_WF)
    assert res.status_code == 201
    mock_upsert.assert_called_once()


@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_create_workflow_409_if_exists(mock_get) -> None:
    res = client.post("/workflow/acme", json=_CUSTOM_WF)
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# GET /workflow/{id}/{wf_id}
# ---------------------------------------------------------------------------

@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_get_one_workflow(mock_get) -> None:
    res = client.get(f"/workflow/acme/{_WF_ID}")
    assert res.status_code == 200
    assert res.json()["workflow_id"] == _WF_ID


@patch("app.main.get_workflow", return_value=None)
def test_get_one_workflow_404(mock_get) -> None:
    assert client.get("/workflow/acme/missing").status_code == 404


# ---------------------------------------------------------------------------
# PUT /workflow/{id}/{wf_id}  — update
# ---------------------------------------------------------------------------

@patch("app.main.upsert_workflow")
@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_update_workflow(mock_get, mock_upsert) -> None:
    updated = {**_CUSTOM_WF, "name": "Field Service v2"}
    res = client.put(f"/workflow/acme/{_WF_ID}", json=updated)
    assert res.status_code == 200
    assert res.json()["name"] == "Field Service v2"
    mock_upsert.assert_called_once()


@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_update_workflow_id_mismatch(mock_get) -> None:
    body = {**_CUSTOM_WF, "workflow_id": "wrong-id"}
    res = client.put(f"/workflow/acme/{_WF_ID}", json=body)
    assert res.status_code == 422


@patch("app.main.get_workflow", return_value=None)
def test_update_workflow_404(mock_get) -> None:
    body = {**_CUSTOM_WF, "workflow_id": "missing"}
    assert client.put("/workflow/acme/missing", json=body).status_code == 404


# ---------------------------------------------------------------------------
# DELETE /workflow/{id}/{wf_id}
# ---------------------------------------------------------------------------

@patch("app.main.delete_flow")
@patch("app.main.delete_workflow", return_value=True)
def test_delete_workflow(mock_del, mock_flow) -> None:
    res = client.delete(f"/workflow/acme/{_WF_ID}")
    assert res.status_code == 204
    mock_flow.assert_called_once_with("acme", _WF_ID)


@patch("app.main.delete_workflow", return_value=False)
def test_delete_workflow_404(mock_del) -> None:
    assert client.delete("/workflow/acme/missing").status_code == 404


# ---------------------------------------------------------------------------
# GET /workflow/{id}/{wf_id}/system-prompt
# ---------------------------------------------------------------------------

@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_system_prompt(mock_get) -> None:
    res = client.get(f"/workflow/acme/{_WF_ID}/system-prompt")
    assert res.status_code == 200
    assert "SiteSurveyForm" in res.json()["system_prompt"]


# ---------------------------------------------------------------------------
# GET /flow/{id}/{wf_id}
# ---------------------------------------------------------------------------

@patch("app.main.get_flow", return_value=_FLOW)
@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_get_flow(mock_wf, mock_flow) -> None:
    res = client.get(f"/flow/acme/{_WF_ID}")
    assert res.status_code == 200
    assert res.json()["step"] == "estimate"
    assert res.json()["workflow_id"] == _WF_ID


@patch("app.main.get_flow", return_value=None)
@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_get_flow_defaults_to_first_step(mock_wf, mock_flow) -> None:
    res = client.get(f"/flow/acme/{_WF_ID}")
    assert res.json()["step"] == "lead"


# ---------------------------------------------------------------------------
# POST /flow/{id}/{wf_id}  — upsert
# ---------------------------------------------------------------------------

@patch("app.main.get_flow", return_value={**_FLOW, "step": "survey", "component": "SiteSurveyForm"})
@patch("app.main.upsert_flow")
@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_upsert_flow_valid_step(mock_wf, mock_upsert, mock_get) -> None:
    res = client.post(f"/flow/acme/{_WF_ID}", json={
        "step": "survey", "component": "SiteSurveyForm", "props": {}, "quote_id": "Q-1",
    })
    assert res.status_code == 200
    mock_upsert.assert_called_once()


@patch("app.main.get_workflow", return_value=_CUSTOM_WF)
def test_upsert_flow_rejects_unknown_step(mock_wf) -> None:
    res = client.post(f"/flow/acme/{_WF_ID}", json={
        "step": "ghost", "component": "GhostCard", "props": {},
    })
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /flow/{id}/{wf_id}  — merge-patch props
# ---------------------------------------------------------------------------

_FLOW_WITH_CONTACT = {
    "step": "lead", "component": "LeadCard",
    "props": {"customer": "ABC Corp", "contact": "John Doe", "deal_size": 5000},
    "quote_id": "Q-acme", "updated_at": "2026-05-09T10:00:00",
}


@patch("app.main.get_flow", side_effect=[_FLOW_WITH_CONTACT, {**_FLOW_WITH_CONTACT, "props": {**_FLOW_WITH_CONTACT["props"], "contact": "Sarah Chen"}}])
@patch("app.main.upsert_flow")
def test_patch_flow_merges_props(mock_upsert, mock_get) -> None:
    res = client.patch(f"/flow/acme/{_WF_ID}", json={"contact": "Sarah Chen"})
    assert res.status_code == 200
    assert res.json()["props"]["contact"] == "Sarah Chen"
    assert res.json()["props"]["customer"] == "ABC Corp"
    assert res.json()["props"]["deal_size"] == 5000
    # upsert_flow(company_id, workflow_id, step, component, props, quote_id)
    assert mock_upsert.call_args.args[4]["contact"] == "Sarah Chen"


@patch("app.main.get_flow", return_value=None)
def test_patch_flow_404_if_no_active_flow(mock_get) -> None:
    res = client.patch(f"/flow/acme/{_WF_ID}", json={"contact": "Sarah Chen"})
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# POST /submissions  /  GET /submissions
# ---------------------------------------------------------------------------

@patch("app.main.save_submission")
def test_submit_step_data(mock_save) -> None:
    res = client.post(f"/submissions/acme/{_WF_ID}", json={"step": "estimate", "total": 850})
    assert res.status_code == 201
    assert "submission_id" in res.json()
    mock_save.assert_called_once()


@patch("app.main.get_submissions", return_value=[
    {"submission_id": "s1", "data": {"step": "estimate", "total": 850}, "created_at": "2026-05-09"},
])
def test_list_submissions(mock_get) -> None:
    res = client.get(f"/submissions/acme/{_WF_ID}")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["data"]["total"] == 850


_LEAD_SUBMISSION = {"submission_id": "s2", "data": {"customer": "ABC Corp", "contact": "John Doe", "deal_size": 5000}, "created_at": "2026-05-09"}


@patch("app.main.get_submissions", return_value=[_LEAD_SUBMISSION])
def test_lookup_submission_found(mock_get) -> None:
    res = client.get(f"/submissions/acme/{_WF_ID}/lookup?step=lead&search=abc+corp")
    assert res.status_code == 200
    assert res.json()["data"]["customer"] == "ABC Corp"
    mock_get.assert_called_once_with("acme", _WF_ID, step="lead", search="abc corp", limit=1)


@patch("app.main.get_submissions", return_value=[])
def test_lookup_submission_404(mock_get) -> None:
    res = client.get(f"/submissions/acme/{_WF_ID}/lookup?step=lead&search=ghost+co")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# POST /actions/estimate-update
# ---------------------------------------------------------------------------

@patch("app.main.upsert_flow")
@patch("app.main.get_flow", return_value=_FLOW)
def test_estimate_update(mock_flow, mock_upsert) -> None:
    res = client.post("/actions/estimate-update", json={
        "company_id": "acme", "workflow_id": _WF_ID, "quote_id": "Q-acme",
        "line_items": [
            {"id": 1, "description": "Labor",     "qty": 12, "rate": 85},
            {"id": 2, "description": "Materials", "qty": 50, "rate": 12},
        ],
    })
    assert res.status_code == 200
    assert res.json()["props"]["total"] == 1620.0


@patch("app.main.get_flow", return_value=None)
def test_estimate_update_404(mock_flow) -> None:
    res = client.post("/actions/estimate-update", json={
        "company_id": "ghost", "workflow_id": "wf", "quote_id": "Q", "line_items": [],
    })
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# POST /actions/approve-send
# ---------------------------------------------------------------------------

@patch("app.main.approve_send_once", return_value=True)
def test_approve_send(mock_send) -> None:
    res = client.post("/actions/approve-send", json={
        "company_id": "acme", "invoice_id": "INV-1", "idempotency_key": "k1",
    })
    assert res.status_code == 200
    assert res.json()["sent"] is True


@patch("app.main.approve_send_once", return_value=False)
def test_approve_send_duplicate(mock_send) -> None:
    res = client.post("/actions/approve-send", json={
        "company_id": "acme", "invoice_id": "INV-1", "idempotency_key": "k1",
    })
    assert res.json()["sent"] is False
