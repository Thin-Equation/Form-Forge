from app.flow import FlowEngine, FlowState


def test_prompt_enters_lead_step() -> None:
    engine = FlowEngine()
    state = FlowState()

    updated = engine.handle_prompt(
        state=state,
        prompt="Pull up Acme lead and draft estimate.",
    )

    assert updated.step == "estimate"


def test_lock_contract_transitions_to_invoice() -> None:
    engine = FlowEngine()
    state = FlowState()

    first = engine.handle_prompt(
        state=state,
        prompt="Pull up Acme lead and draft estimate.",
    )
    second = engine.handle_prompt(
        state=first,
        prompt="Lock contract and generate invoice.",
    )

    assert second.step == "invoice"
