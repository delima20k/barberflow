-- =============================================================
-- Migration: 20260626000002_asaas_professional_payments.sql
-- Descricao: Persistencia de cobrancas Asaas para planos do app
--            profissional. Nao armazena dados de cartao.
-- Rollback: DROP TABLE public.asaas_webhook_events;
--           DROP TABLE public.asaas_payments;
--           DROP TABLE public.asaas_customers;
-- =============================================================

CREATE TABLE IF NOT EXISTS public.asaas_customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asaas_customer_id text NOT NULL UNIQUE,
  name              text NOT NULL,
  email             text,
  mobile_phone      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.asaas_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  barbershop_id       uuid REFERENCES public.barbershops(id) ON DELETE SET NULL,
  asaas_customer_id   text NOT NULL,
  asaas_payment_id    text NOT NULL UNIQUE,
  plan_type           text NOT NULL CHECK (plan_type IN ('mensal', 'trimestral')),
  pro_type            text NOT NULL DEFAULT 'barbeiro' CHECK (pro_type IN ('barbeiro', 'barbearia')),
  billing_type        text NOT NULL CHECK (billing_type IN ('PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED')),
  status              text NOT NULL DEFAULT 'PENDING',
  value               numeric(12,2) NOT NULL CHECK (value > 0),
  due_date            date NOT NULL,
  description         text,
  invoice_url         text,
  bank_slip_url       text,
  pix_payload         text,
  pix_expiration_date timestamptz,
  raw_payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          text NOT NULL UNIQUE,
  event_type        text NOT NULL,
  asaas_payment_id  text,
  payment_id        uuid REFERENCES public.asaas_payments(id) ON DELETE SET NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asaas_customers_user
  ON public.asaas_customers (user_id);

CREATE INDEX IF NOT EXISTS idx_asaas_payments_user_created
  ON public.asaas_payments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asaas_payments_status
  ON public.asaas_payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asaas_payments_asaas_customer
  ON public.asaas_payments (asaas_customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_payment
  ON public.asaas_webhook_events (asaas_payment_id, created_at DESC);

ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asaas_customers_select_own" ON public.asaas_customers;
CREATE POLICY "asaas_customers_select_own"
  ON public.asaas_customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "asaas_customers_insert_service" ON public.asaas_customers;
CREATE POLICY "asaas_customers_insert_service"
  ON public.asaas_customers FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_customers_update_service" ON public.asaas_customers;
CREATE POLICY "asaas_customers_update_service"
  ON public.asaas_customers FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_customers_delete_service" ON public.asaas_customers;
CREATE POLICY "asaas_customers_delete_service"
  ON public.asaas_customers FOR DELETE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_payments_select_own" ON public.asaas_payments;
CREATE POLICY "asaas_payments_select_own"
  ON public.asaas_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "asaas_payments_insert_service" ON public.asaas_payments;
CREATE POLICY "asaas_payments_insert_service"
  ON public.asaas_payments FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_payments_update_service" ON public.asaas_payments;
CREATE POLICY "asaas_payments_update_service"
  ON public.asaas_payments FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_payments_delete_service" ON public.asaas_payments;
CREATE POLICY "asaas_payments_delete_service"
  ON public.asaas_payments FOR DELETE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "asaas_webhook_events_service_all" ON public.asaas_webhook_events;
CREATE POLICY "asaas_webhook_events_service_all"
  ON public.asaas_webhook_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_asaas_customers_updated_at ON public.asaas_customers;
CREATE TRIGGER trg_asaas_customers_updated_at
  BEFORE UPDATE ON public.asaas_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_asaas_payments_updated_at ON public.asaas_payments;
CREATE TRIGGER trg_asaas_payments_updated_at
  BEFORE UPDATE ON public.asaas_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.asaas_customers IS
  'Vinculo entre usuario profissional BarberFlow e customer no Asaas. Nao armazenar CPF/CNPJ completo.';

COMMENT ON TABLE public.asaas_payments IS
  'Cobrancas Asaas dos planos do app profissional. Nao armazenar dados de cartao.';

COMMENT ON TABLE public.asaas_webhook_events IS
  'Eventos de webhook Asaas processados de forma idempotente.';
