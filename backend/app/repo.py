import os
import sqlite3
from pathlib import Path


def _db_path() -> Path:
    configured = os.getenv("IDEMPOTENCY_DB_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / "idempotency.sqlite3"


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            invoice_id TEXT NOT NULL,
            key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (invoice_id, key)
        )
        """
    )


def reserve_idempotency_key(invoice_id: str, key: str) -> bool:
    db_file = _db_path()
    db_file.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_file, timeout=5.0) as connection:
        _ensure_schema(connection)
        cursor = connection.execute(
            "INSERT OR IGNORE INTO idempotency_keys(invoice_id, key) VALUES (?, ?)",
            (invoice_id, key),
        )
        connection.commit()
        return cursor.rowcount == 1
