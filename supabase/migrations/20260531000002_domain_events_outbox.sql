-- 20260531000002_domain_events_outbox.sql
-- Tabela de outbox para o padrão Outbox Pattern do BFF.
-- Usada por SendMessageUseCase ao persistir mensagens de chat.

CREATE TABLE IF NOT EXISTS public.domain_events_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue        text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','done','failed')),
  attempts     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON public.domain_events_outbox(status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.domain_events_outbox ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (BFF) acessa esta tabela — sem políticas públicas
COMMENT ON TABLE public.domain_events_outbox
  IS 'Outbox Pattern: eventos de domínio pendentes de entrega pelo BFF (service_role only)';
