-- =============================================================
-- Migration: push_subscriptions v2
-- Adiciona colunas para segmentação por app e controle de validade.
--
-- Colunas novas:
--   device_id    — UUID persistido no browser (bf_device_id localStorage)
--   app_id       — 'cliente' | 'profissional'
--   is_valid     — false quando endpoint retorna 410/404 (subscription expirou)
--   last_used_at — timestamp do último push bem-sucedido
-- =============================================================

alter table public.push_subscriptions
  add column if not exists device_id     text,
  add column if not exists app_id        text check (app_id in ('cliente', 'profissional')),
  add column if not exists is_valid      boolean not null default true,
  add column if not exists last_used_at  timestamptz not null default now();

comment on column public.push_subscriptions.device_id    is 'UUID persistido em localStorage (bf_device_id). Identifica o dispositivo.';
comment on column public.push_subscriptions.app_id       is 'App que gerou a subscription: cliente | profissional.';
comment on column public.push_subscriptions.is_valid     is 'false quando o push service retorna 410 ou 404 (subscription expirada ou inválida).';
comment on column public.push_subscriptions.last_used_at is 'Timestamp do último envio bem-sucedido para esta subscription.';

-- ── Index otimizado para a query de envio de push ────────────

create index if not exists idx_push_subs_send
  on public.push_subscriptions (user_id, app_id, is_valid)
  where is_valid = true;

-- ── Policy: usuário pode atualizar suas próprias subscriptions ──
-- (necessário para o PushSubscriptionService atualizar is_valid localmente)

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'push_subscriptions'
      and policyname = 'push_subs_update_own'
  ) then
    execute $policy$
      create policy "push_subs_update_own"
        on public.push_subscriptions
        for update
        using     (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $policy$;
  end if;
end $$;
