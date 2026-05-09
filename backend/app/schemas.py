from typing import Any, Literal

from pydantic import BaseModel, field_validator, model_validator


# ---------------------------------------------------------------------------
# Form field definition
# ---------------------------------------------------------------------------

FieldType = Literal["text", "number", "select", "date", "textarea", "checkbox"]


class FormField(BaseModel):
    key: str
    label: str
    type: FieldType = "text"
    required: bool = False
    options: list[str] = []
    placeholder: str = ""


# ---------------------------------------------------------------------------
# Workflow configuration
# ---------------------------------------------------------------------------

class WorkflowStep(BaseModel):
    id: str
    name: str
    component: str
    description: str
    transitions: list[str] = []
    fields: list[FormField] = []


class Workflow(BaseModel):
    workflow_id: str
    name: str
    steps: list[WorkflowStep]

    @field_validator("steps")
    @classmethod
    def steps_not_empty(cls, v: list[WorkflowStep]) -> list[WorkflowStep]:
        if not v:
            raise ValueError("Workflow must have at least one step.")
        return v

    @model_validator(mode="after")
    def transitions_reference_valid_steps(self) -> "Workflow":
        ids = {s.id for s in self.steps}
        for step in self.steps:
            bad = [t for t in step.transitions if t not in ids]
            if bad:
                raise ValueError(
                    f"Step '{step.id}' has transitions to unknown step(s): {bad}"
                )
        return self

    def step_ids(self) -> list[str]:
        return [s.id for s in self.steps]

    def get_step(self, step_id: str) -> WorkflowStep | None:
        return next((s for s in self.steps if s.id == step_id), None)

    def to_system_prompt(self) -> str:
        lines = [
            f"Workflow: {self.name}",
            "Available steps (call the matching render function for each):",
        ]
        for step in self.steps:
            next_str = ", ".join(step.transitions) if step.transitions else "terminal"
            line = (
                f"  • {step.id} → render function: {step.component}"
                f" | {step.description}"
                f" | next: {next_str}"
            )
            if step.fields:
                field_desc = ", ".join(
                    f"{f.key} ({f.type}{'*' if f.required else ''})" for f in step.fields
                )
                line += f" | fields: {field_desc}"
            lines.append(line)
        return "\n".join(lines)


class WorkflowSummary(BaseModel):
    """Lightweight list item — no step details."""
    workflow_id: str
    name: str
    step_count: int
    current_step: str | None = None


DEFAULT_WORKFLOW = Workflow(
    workflow_id="default-quote-to-cash",
    name="Quote to Cash",
    steps=[
        WorkflowStep(
            id="lead",
            name="Lead Review",
            component="LeadCard",
            description="Show lead or prospect information for a company",
            transitions=["estimate"],
            fields=[
                FormField(key="customer",  label="Customer Name", type="text",   required=True),
                FormField(key="deal_size", label="Deal Size ($)", type="number", required=True),
                FormField(key="status",    label="Status",        type="select", required=True,
                          options=["new", "qualifying", "proposal"]),
                FormField(key="contact",   label="Contact Name",  type="text"),
                FormField(key="industry",  label="Industry",      type="text"),
            ],
        ),
        WorkflowStep(
            id="estimate",
            name="Draft Estimate",
            component="EditableEstimate",
            description="Create and edit a line-item estimate or quote",
            transitions=["invoice", "lead"],
            fields=[
                FormField(key="customer",    label="Customer Name", type="text",     required=True),
                FormField(key="estimate_id", label="Estimate ID",   type="text",     required=True),
                FormField(key="line_items",  label="Line Items",    type="textarea", required=True,
                          placeholder="qty × rate rows"),
                FormField(key="total",       label="Total ($)",     type="number",   required=True),
            ],
        ),
        WorkflowStep(
            id="invoice",
            name="Generate Invoice",
            component="InvoiceAction",
            description="Review and approve-and-send a final invoice",
            transitions=[],
            fields=[
                FormField(key="customer",   label="Customer Name", type="text",   required=True),
                FormField(key="invoice_id", label="Invoice ID",    type="text",   required=True),
                FormField(key="amount",     label="Amount ($)",    type="number", required=True),
                FormField(key="status",     label="Status",        type="select", required=True,
                          options=["draft", "pending_approval", "sent"]),
                FormField(key="due_date",   label="Due Date",      type="date"),
            ],
        ),
    ],
)


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

class OnboardingStatus(BaseModel):
    company_id: str
    is_onboarded: bool
    workflows: list[WorkflowSummary] = []


class OnboardRequest(BaseModel):
    workflow: Workflow


class OnboardResponse(BaseModel):
    workflow: Workflow
    initial_flow: "FlowStateResponse"


# ---------------------------------------------------------------------------
# Flow state — keyed by (company_id, workflow_id)
# ---------------------------------------------------------------------------

class FlowState(BaseModel):
    step: str
    component: str
    props: dict[str, Any] = {}
    quote_id: str = ""


class FlowStateResponse(FlowState):
    company_id: str
    workflow_id: str
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Action request / response bodies
# ---------------------------------------------------------------------------

class LineItem(BaseModel):
    id: int
    description: str
    qty: float
    rate: float


class EstimateUpdateRequest(BaseModel):
    company_id: str
    workflow_id: str
    quote_id: str
    line_items: list[LineItem]


class EstimateUpdateResponse(BaseModel):
    component: str
    step: str
    props: dict[str, Any]


class ApproveSendRequest(BaseModel):
    company_id: str
    invoice_id: str
    idempotency_key: str = ""


class ApproveSendResponse(BaseModel):
    sent: bool
    message: str
