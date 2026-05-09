"""
Tests for business-logic helpers (pure math + mocked Supabase).
"""
from unittest.mock import MagicMock, patch

from app.flow import approve_send_once, recompute_estimate_total


# ---------------------------------------------------------------------------
# recompute_estimate_total — pure math, no I/O
# ---------------------------------------------------------------------------

def test_recompute_basic() -> None:
    assert recompute_estimate_total([{"qty": 10, "rate": 85}, {"qty": 50, "rate": 12}]) == 1450


def test_recompute_currency_precision() -> None:
    assert recompute_estimate_total([{"qty": 3, "rate": 0.1}]) == 0.3


def test_recompute_empty() -> None:
    assert recompute_estimate_total([]) == 0.0


# ---------------------------------------------------------------------------
# approve_send_once — mocked Supabase client
# ---------------------------------------------------------------------------

def _supabase_mock(*, insert_succeeds: bool) -> MagicMock:
    result = MagicMock()
    result.data = [{"invoice_id": "x"}] if insert_succeeds else []

    execute = MagicMock(return_value=result)
    insert = MagicMock()
    insert.execute = execute

    table = MagicMock()
    table.insert.return_value = insert

    client = MagicMock()
    client.table.return_value = table
    return client


@patch("app.repo._client")
def test_approve_send_first_call_true(mock_fn) -> None:
    mock_fn.return_value = _supabase_mock(insert_succeeds=True)
    assert approve_send_once("inv-1", "k-1") is True


@patch("app.repo._client")
def test_approve_send_duplicate_false(mock_fn) -> None:
    mock_fn.return_value = _supabase_mock(insert_succeeds=False)
    assert approve_send_once("inv-dup", "k-dup") is False


@patch("app.repo._client")
def test_approve_send_different_keys_both_succeed(mock_fn) -> None:
    mock_fn.return_value = _supabase_mock(insert_succeeds=True)
    assert approve_send_once("inv-2", "k-a") is True
    assert approve_send_once("inv-2", "k-b") is True
