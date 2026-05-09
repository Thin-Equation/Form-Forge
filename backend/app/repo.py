"""
Supabase-backed persistence layer.

Required environment variables:
    SUPABASE_URL  — project URL, e.g. https://xxxx.supabase.co
    SUPABASE_KEY  — service-role secret key (server-side only)

Tables (see supabase/migrations/):
    company_workflows  PK (company_id, workflow_id)
    company_flows      PK (company_id, workflow_id)
    idempotency_keys   PK (invoice_id, key)
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from supabase import Client, create_client


@lru_cache(maxsize=1)
def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Workflow CRUD — many workflows per company
# ---------------------------------------------------------------------------

def list_workflows(company_id: str) -> list[dict[str, Any]]:
    """Return all workflows for *company_id*, ordered by creation time."""
    result = (
        _client()
        .table("company_workflows")
        .select("workflow_id, workflow, updated_at")
        .eq("company_id", company_id)
        .order("updated_at", desc=False)
        .execute()
    )
    return result.data or []


def get_workflow(company_id: str, workflow_id: str) -> dict[str, Any] | None:
    """Return the raw workflow dict, or None if not found."""
    result = (
        _client()
        .table("company_workflows")
        .select("workflow")
        .eq("company_id", company_id)
        .eq("workflow_id", workflow_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return None
    return result.data["workflow"]


def upsert_workflow(company_id: str, workflow_id: str, workflow: dict[str, Any]) -> None:
    """Insert or replace a workflow. workflow_id is stored both as a column and inside the JSONB."""
    _client().table("company_workflows").upsert(
        {"company_id": company_id, "workflow_id": workflow_id, "workflow": workflow},
        on_conflict="company_id,workflow_id",
    ).execute()


def delete_workflow(company_id: str, workflow_id: str) -> bool:
    """Delete the workflow. Returns True if a row was deleted."""
    result = (
        _client()
        .table("company_workflows")
        .delete()
        .eq("company_id", company_id)
        .eq("workflow_id", workflow_id)
        .execute()
    )
    return bool(result.data)


# ---------------------------------------------------------------------------
# Flow state — one active state per (company_id, workflow_id)
# ---------------------------------------------------------------------------

def get_flow(company_id: str, workflow_id: str) -> dict[str, Any] | None:
    """Return the flow state for this company+workflow, or None."""
    result = (
        _client()
        .table("company_flows")
        .select("step, component, props, quote_id, updated_at")
        .eq("company_id", company_id)
        .eq("workflow_id", workflow_id)
        .maybe_single()
        .execute()
    )
    return result.data


def upsert_flow(
    company_id: str,
    workflow_id: str,
    step: str,
    component: str,
    props: dict[str, Any],
    quote_id: str,
) -> None:
    _client().table("company_flows").upsert(
        {
            "company_id":  company_id,
            "workflow_id": workflow_id,
            "step":        step,
            "component":   component,
            "props":       props,
            "quote_id":    quote_id,
        },
        on_conflict="company_id,workflow_id",
    ).execute()


def delete_flow(company_id: str, workflow_id: str) -> None:
    """Remove flow state when its workflow is deleted."""
    (
        _client()
        .table("company_flows")
        .delete()
        .eq("company_id", company_id)
        .eq("workflow_id", workflow_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Form submissions — immutable records powering the dynamic dashboard
# ---------------------------------------------------------------------------

def save_submission(
    company_id: str,
    workflow_id: str,
    submission_id: str,
    data: dict[str, Any],
) -> None:
    _client().table("form_submissions").insert({
        "company_id":    company_id,
        "workflow_id":   workflow_id,
        "submission_id": submission_id,
        "data":          data,
    }).execute()


def get_submissions(
    company_id: str,
    workflow_id: str,
    step: str | None = None,
    search: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Return submissions newest-first.
    *step*   — filter to a specific workflow step (e.g. "lead")
    *search* — case-insensitive substring match across the JSONB data column
    """
    q = (
        _client()
        .table("form_submissions")
        .select("submission_id, data, created_at")
        .eq("company_id", company_id)
        .eq("workflow_id", workflow_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if step:
        q = q.eq("step", step)
    if search:
        # PostgREST full-text / ilike on JSONB cast to text
        q = q.ilike("data->>customer", f"%{search}%")
    result = q.execute()
    return result.data or []


# ---------------------------------------------------------------------------
# Idempotency keys
# ---------------------------------------------------------------------------

def reserve_idempotency_key(invoice_id: str, key: str) -> bool:
    result = (
        _client()
        .table("idempotency_keys")
        .insert({"invoice_id": invoice_id, "key": key}, returning="minimal")
        .execute()
    )
    return bool(result.data)
