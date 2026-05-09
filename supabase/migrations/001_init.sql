-- A2UI Quote-to-Cash schema
-- Run once against your Supabase project via the SQL editor or supabase db push.

-- -----------------------------------------------------------------------
-- company_flows
-- One row per company (tenant). All users of the same company share this
-- row so they always see the current agent-generated flow state.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_flows (
    company_id  TEXT        PRIMARY KEY,
    step        TEXT        NOT NULL DEFAULT 'lead'
                            CHECK (step IN ('lead', 'estimate', 'invoice')),
    component   TEXT        NOT NULL DEFAULT 'LeadCard',
    props       JSONB       NOT NULL DEFAULT '{}',
    quote_id    TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_flows_updated_at ON public.company_flows;
CREATE TRIGGER trg_company_flows_updated_at
    BEFORE UPDATE ON public.company_flows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------
-- idempotency_keys
-- Guards against duplicate invoice sends (approve-and-send button).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    invoice_id  TEXT        NOT NULL,
    key         TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (invoice_id, key)
);

-- -----------------------------------------------------------------------
-- Row-level security
-- Service-role key bypasses RLS; enable RLS for future user-auth hardening.
-- -----------------------------------------------------------------------
ALTER TABLE public.company_flows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by the FastAPI backend)
CREATE POLICY "service_role_all" ON public.company_flows
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.idempotency_keys
    FOR ALL TO service_role USING (true) WITH CHECK (true);
