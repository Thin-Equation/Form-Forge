"""
Tests for Workflow schema validation and system-prompt generation.
"""
import pytest
from pydantic import ValidationError

from app.schemas import DEFAULT_WORKFLOW, Workflow, WorkflowStep


def _step(id: str, component: str, transitions: list[str] | None = None) -> WorkflowStep:
    return WorkflowStep(
        id=id,
        name=id.title(),
        component=component,
        description=f"Render {component}",
        transitions=transitions or [],
        fields=[],
    )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_default_workflow_is_valid() -> None:
    assert len(DEFAULT_WORKFLOW.steps) == 3
    assert DEFAULT_WORKFLOW.step_ids() == ["lead", "estimate", "invoice"]


def test_workflow_rejects_empty_steps() -> None:
    with pytest.raises(ValidationError, match="at least one step"):
        Workflow(workflow_id="x", name="Empty", steps=[])


def test_workflow_rejects_invalid_transition_target() -> None:
    with pytest.raises(ValidationError, match="unknown step"):
        Workflow(
            workflow_id="x",
            name="Bad",
            steps=[_step("lead", "LeadCard", transitions=["ghost"])],
        )


def test_custom_workflow_with_extra_step() -> None:
    wf = Workflow(
        workflow_id="field-service",
        name="Field Service",
        steps=[
            _step("lead",        "LeadCard",         ["survey"]),
            _step("survey",      "SiteSurveyForm",   ["estimate"]),
            _step("estimate",    "EditableEstimate",  ["invoice"]),
            _step("invoice",     "InvoiceAction",     []),
        ],
    )
    assert wf.step_ids() == ["lead", "survey", "estimate", "invoice"]
    assert wf.get_step("survey").component == "SiteSurveyForm"


def test_get_step_returns_none_for_unknown() -> None:
    assert DEFAULT_WORKFLOW.get_step("nonexistent") is None


# ---------------------------------------------------------------------------
# system-prompt generation
# ---------------------------------------------------------------------------

def test_system_prompt_contains_all_steps() -> None:
    prompt = DEFAULT_WORKFLOW.to_system_prompt()
    assert "lead" in prompt
    assert "estimate" in prompt
    assert "invoice" in prompt
    assert "LeadCard" in prompt
    assert "EditableEstimate" in prompt
    assert "InvoiceAction" in prompt


def test_system_prompt_terminal_step_labelled() -> None:
    prompt = DEFAULT_WORKFLOW.to_system_prompt()
    assert "terminal" in prompt


def test_system_prompt_includes_field_names() -> None:
    prompt = DEFAULT_WORKFLOW.to_system_prompt()
    assert "customer" in prompt
    assert "deal_size" in prompt


def test_system_prompt_marks_required_fields() -> None:
    prompt = DEFAULT_WORKFLOW.to_system_prompt()
    assert "*" in prompt   # required fields marked with *


def test_custom_workflow_system_prompt() -> None:
    from app.schemas import FormField
    wf = Workflow(
        workflow_id="approval-flow",
        name="Approval Flow",
        steps=[
            WorkflowStep(id="draft", name="Draft", component="DraftCard",
                         description="d", transitions=["approval"],
                         fields=[FormField(key="title", label="Title", type="text", required=True)]),
            _step("approval", "ApprovalForm", []),
        ],
    )
    prompt = wf.to_system_prompt()
    assert "DraftCard" in prompt
    assert "ApprovalForm" in prompt
    assert "next: approval" in prompt
    assert "title (text*)" in prompt
