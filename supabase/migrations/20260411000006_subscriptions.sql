-- =============================================================
-- Migration: subscriptions table
-- BarberFlow — controle de planos e assinaturas
-- =============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type      text NOT NULL CHECK (plan_type IN ('trial', 'mensal', 'trimestral')),
  status         text NOT NULL DEFAULT 'trial'
                   CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  purchase_token text,
  platform       text NOT NULL DEFAULT 'web'
                   CHECK (platform IN ('android', 'web')),
  starts_at      timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Índice para consultas por usuário + status (mais comum)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON public.subscriptions (user_id, status);

-- Índice para limpeza de assinaturas expiradas
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
  ON public.subscriptions (ends_at);

-- =============================================================
-- RLS — Row Level Security
-- =============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler apenas suas próprias assinaturas
CREATE POLICY "subscriptions: user can select own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT e UPDATE apenas via service_role (Edge Functions)
-- Browser/client direto não pode inserir — evita fraude
CREATE POLICY "subscriptions: service_role only insert"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "subscriptions: service_role only update"
  ON public.subscriptions FOR UPDATE
  USING (auth.role() = 'service_role');
