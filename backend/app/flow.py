from dataclasses import dataclass

from app.repo import reserve_idempotency_key


@dataclass(frozen=True)
class FlowState:
    step: str = "lead"


class FlowEngine:
    def handle_prompt(self, state: FlowState, prompt: str) -> FlowState:
        text = prompt.lower()

        if "invoice" in text and state.step == "estimate":
            return FlowState(step="invoice")
        if "estimate" in text:
            return FlowState(step="estimate")
        if "lead" in text:
            return FlowState(step="lead")

        return state


def recompute_estimate_total(items: list[dict[str, float]]) -> float:
    return sum(item["qty"] * item["rate"] for item in items)


def approve_send_once(invoice_id: str, key: str) -> bool:
    return reserve_idempotency_key(invoice_id=invoice_id, key=key)
