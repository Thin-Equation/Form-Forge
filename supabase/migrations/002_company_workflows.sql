-- Company-configurable workflow definitions.
-- Each row stores the full workflow as JSONB so step schemas can evolve freely.

CREATE TABLE IF NOT EXISTS public.company_workflows (
    company_id  TEXT        PRIMARY KEY,
    workflow    JSONB       NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_company_workflows_updated_at ON public.company_workflows;
CREATE TRIGGER trg_company_workflows_updated_at
    BEFORE UPDATE ON public.company_workflows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Also relax the hard-coded step CHECK on company_flows so custom step IDs work.
ALTER TABLE public.company_flows
    DROP CONSTRAINT IF EXISTS company_flows_step_check;

ALTER TABLE public.company_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.company_workflows
    FOR ALL TO service_role USING (true) WITH CHECK (true);
