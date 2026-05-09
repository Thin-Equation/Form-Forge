from typing import Literal

from pydantic import BaseModel

Step = Literal["lead", "estimate", "invoice"]


class A2UIMeta(BaseModel):
    step: Step
    tenant_id: str


class A2UIRenderEvent(BaseModel):
    event_type: Literal["a2ui.render"] = "a2ui.render"
    quote_id: str
    meta: A2UIMeta
