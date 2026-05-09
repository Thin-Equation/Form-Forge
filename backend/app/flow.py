from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

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
    total = sum(
        (Decimal(str(item["qty"])) * Decimal(str(item["rate"])) for item in items),
        start=Decimal("0"),
    )
    return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def approve_send_once(invoice_id: str, key: str) -> bool:
    return reserve_idempotency_key(invoice_id=invoice_id, key=key)
