-- ==============================================================
-- Migration: 20260413000005_location_and_legal.sql
-- Descrição: Localização do usuário + Aceite legal profissional
-- ==============================================================


-- ══════════════════════════════════════════════════════════════
-- PARTE 1 — Última localização do usuário (fallback GPS)
-- ══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists last_lat         numeric(10,7),
  add column if not exists last_lng         numeric(10,7),
  add column if not exists last_location_at timestamptz;

create index if not exists idx_profiles_location
  on public.profiles (last_lat, last_lng)
  where last_lat is not null;


-- ══════════════════════════════════════════════════════════════
-- PARTE 2 — Aceite legal dos profissionais
-- ══════════════════════════════════════════════════════════════

create table if not exists public.legal_consents (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  plan_type         text        not null check (plan_type in ('trial', 'mensal', 'trimestral')),

  -- Flags individuais por seção (auditoria)
  aceitou_termos    boolean     not null default false,
  direitos_autorais boolean     not null default false,
  uso_arquivos      boolean     not null default false,
  uso_gps           boolean     not null default false,

  -- Metadados
  data_aceite       timestamptz not null default now(),
  version           integer     not null default 1,   -- versão dos termos aceitos
  ip_hint           text,                              -- identificação de sessão (opcional)

  -- 1 registro por usuário — re-aceite via UPSERT
  constraint legal_consents_user_unique unique (user_id)
);

create index if not exists legal_consents_user_id_idx
  on public.legal_consents (user_id);

-- Row Level Security
alter table public.legal_consents enable row level security;

create policy "legal_consents: select próprio"
  on public.legal_consents for select
  using (auth.uid() = user_id);

create policy "legal_consents: insert próprio"
  on public.legal_consents for insert
  with check (auth.uid() = user_id);

create policy "legal_consents: update próprio"
  on public.legal_consents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
