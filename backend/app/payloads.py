from app.schemas import A2UIRenderEvent


def build_render_event(quote_id: str, step: str, tenant_id: str) -> A2UIRenderEvent:
    return A2UIRenderEvent(
        quote_id=quote_id,
        meta={"step": step, "tenant_id": tenant_id},
    )
