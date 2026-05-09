-- Multi-workflow support + form submissions table.
-- Run after 001_init.sql and 002_company_workflows.sql.

-- -----------------------------------------------------------------------
-- Rebuild company_workflows with (company_id, workflow_id) PK
-- -----------------------------------------------------------------------
DROP TABLE IF EXISTS public.company_workflows;

CREATE TABLE public.company_workflows (
    company_id  TEXT        NOT NULL,
    workflow_id TEXT        NOT NULL,
    workflow    JSONB       NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, workflow_id)
);

DROP TRIGGER IF EXISTS trg_company_workflows_updated_at ON public.company_workflows;
CREATE TRIGGER trg_company_workflows_updated_at
    BEFORE UPDATE ON public.company_workflows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------
-- Rebuild company_flows with (company_id, workflow_id) PK
-- -----------------------------------------------------------------------
DROP TABLE IF EXISTS public.company_flows;

CREATE TABLE public.company_flows (
    company_id  TEXT        NOT NULL,
    workflow_id TEXT        NOT NULL,
    step        TEXT        NOT NULL DEFAULT 'lead',
    component   TEXT        NOT NULL DEFAULT 'LeadCard',
    props       JSONB       NOT NULL DEFAULT '{}',
    quote_id    TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, workflow_id)
);

DROP TRIGGER IF EXISTS trg_company_flows_updated_at ON public.company_flows;
CREATE TRIGGER trg_company_flows_updated_at
    BEFORE UPDATE ON public.company_flows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------
-- form_submissions — immutable append-only records per step completion
-- Powers the dynamic dashboard without needing extra persistence.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_submissions (
    id            BIGSERIAL   PRIMARY KEY,
    company_id    TEXT        NOT NULL,
    workflow_id   TEXT        NOT NULL,
    submission_id TEXT        NOT NULL UNIQUE,
    data          JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_company_workflow
    ON public.form_submissions (company_id, workflow_id, created_at DESC);

-- -----------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------
ALTER TABLE public.company_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_flows     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.company_workflows
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.company_flows
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.form_submissions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
