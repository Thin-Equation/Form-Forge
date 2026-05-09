from dataclasses import dataclass

from app.repo import SEEN_KEYS


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
    seen_key = f"{invoice_id}:{key}"
    if seen_key in SEEN_KEYS:
        return False
    SEEN_KEYS.add(seen_key)
    return True
