from app.flow import approve_send_once, recompute_estimate_total
from app.repo import SEEN_KEYS


def test_recompute_estimate_total() -> None:
    total = recompute_estimate_total(
        [{"qty": 10, "rate": 85}, {"qty": 50, "rate": 12}]
    )

    assert total == 1450


def test_approve_send_once_idempotency() -> None:
    SEEN_KEYS.clear()

    first = approve_send_once(invoice_id="inv1", key="k1")
    second = approve_send_once(invoice_id="inv1", key="k1")

    assert first is True
    assert second is False
