from decimal import ROUND_HALF_UP, Decimal

from app.repo import reserve_idempotency_key


def recompute_estimate_total(items: list[dict]) -> float:
    total = sum(
        (Decimal(str(item["qty"])) * Decimal(str(item["rate"])) for item in items),
        start=Decimal("0"),
    )
    return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def approve_send_once(invoice_id: str, key: str) -> bool:
    return reserve_idempotency_key(invoice_id=invoice_id, key=key)
