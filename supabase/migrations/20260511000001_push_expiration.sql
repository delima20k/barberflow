-- =============================================================
-- Migration: push_subscriptions — coluna expiration_time
--
-- Adiciona coluna para registrar a data de expiração da subscription
-- reportada pelo browser (PushSubscription.expirationTime).
--
-- null = sem expiração (a maioria dos browsers retorna null).
-- Quando preenchida, o PushSubscriptionService re-registra automaticamente
-- a subscription antes de ela expirar (janela: 24h antecipação).
-- =============================================================

alter table public.push_subscriptions
  add column if not exists expiration_time timestamptz null;

comment on column public.push_subscriptions.expiration_time is
  'Data de expiração da subscription (PushSubscription.expirationTime em UTC). null = sem expiração definida.';

-- Index parcial: apenas rows com expiração definida — facilita limpeza periódica
create index if not exists idx_push_subs_expiration
  on public.push_subscriptions (expiration_time)
  where expiration_time is not null;
