import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.flow import approve_send_once, recompute_estimate_total

BACKEND_DIR = Path(__file__).resolve().parents[1]

def test_recompute_estimate_total() -> None:
    total = recompute_estimate_total(
        [{"qty": 10, "rate": 85}, {"qty": 50, "rate": 12}]
    )

    assert total == 1450


def test_approve_send_once_idempotency(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("IDEMPOTENCY_DB_PATH", str(tmp_path / "idempotency.sqlite3"))

    first = approve_send_once(invoice_id="inv-basic", key="k-basic")
    second = approve_send_once(invoice_id="inv-basic", key="k-basic")

    assert first is True
    assert second is False


def test_approve_send_once_persists_across_processes(tmp_path) -> None:
    db_path = tmp_path / "idempotency.sqlite3"
    env = {**os.environ, "IDEMPOTENCY_DB_PATH": str(db_path)}

    script = (
        "from app.flow import approve_send_once;"
        "print(approve_send_once('inv-process', 'key-1'))"
    )
    first = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_DIR),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    second = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_DIR),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    assert first == "True"
    assert second == "False"


def test_approve_send_once_atomic_under_concurrency(tmp_path) -> None:
    db_path = tmp_path / "idempotency.sqlite3"
    env = {**os.environ, "IDEMPOTENCY_DB_PATH": str(db_path)}
    script = (
        "from app.flow import approve_send_once;"
        "print(approve_send_once('inv-race', 'k-race'))"
    )

    with ThreadPoolExecutor(max_workers=16) as executor:
        outputs = list(
            executor.map(
                lambda _: subprocess.run(
                    [sys.executable, "-c", script],
                    cwd=str(BACKEND_DIR),
                    env=env,
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip(),
                range(64),
            )
        )

    assert outputs.count("True") == 1
