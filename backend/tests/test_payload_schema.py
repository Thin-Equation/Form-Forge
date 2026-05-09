import pytest
from pydantic import ValidationError

from app.payloads import build_render_event
from app.schemas import A2UIRenderEvent


def test_valid_a2ui_render_event() -> None:
    event = build_render_event(
        quote_id="Q-1001",
        step="estimate",
        tenant_id="tenant-1",
    )

    assert isinstance(event, A2UIRenderEvent)
    assert event.event_type == "a2ui.render"
    assert event.quote_id == "Q-1001"
    assert event.meta.step == "estimate"
    assert event.meta.tenant_id == "tenant-1"


def test_invalid_step_rejected() -> None:
    with pytest.raises(ValidationError):
        build_render_event(
            quote_id="Q-1001",
            step="invalid",
            tenant_id="tenant-1",
        )
