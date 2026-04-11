-- ==============================================================
-- Migration: 20260411000006_notifications_rls.sql
-- Descrição: RLS para tabela notifications + tabela push_subscriptions
-- ==============================================================

-- ── RLS na tabela notifications ────────────────────────────

alter table public.notifications enable row level security;

-- Usuário vê apenas suas próprias notificações
create policy "notifications_select_own"
  on public.notifications
  for select
  using (auth.uid() = user_id);

-- Usuário pode marcar suas notificações como lidas
create policy "notifications_update_own"
  on public.notifications
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserções feitas por funções do servidor (service role) ou triggers
create policy "notifications_insert_service"
  on public.notifications
  for insert
  with check (true); -- controle feito via service_role / triggers

-- ── Tabela de subscriptions de push ────────────────────────

create table if not exists public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Subscriptions Web Push por usuário. endpoint é a URL do push service. 
   p256dh e auth_key são as chaves de criptografia do browser.';

create index idx_push_subs_user on public.push_subscriptions(user_id);

-- RLS: usuário gerencia apenas suas próprias subscriptions
alter table public.push_subscriptions enable row level security;

create policy "push_subs_select_own"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

create policy "push_subs_insert_own"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

create policy "push_subs_delete_own"
  on public.push_subscriptions
  for delete
  using (auth.uid() = user_id);

-- ── Trigger: atualiza updated_at em push_subscriptions ─────

create or replace function public.trg_set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_push_subs_updated_at
  before update on public.push_subscriptions
  for each row execute function public.trg_set_updated_at();

-- ── Índice extra para queries rápidas de notifs não lidas ───

create index if not exists idx_notifications_unread
  on public.notifications(user_id, created_at desc)
  where is_read = false;
