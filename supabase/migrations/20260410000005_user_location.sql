-- ==============================================================
-- Migration 20260410000005_user_location
-- Ultima localizacao do usuario (fallback GPS)
-- ==============================================================
alter table public.profiles
  add column if not exists last_lat         numeric(10, 7),
  add column if not exists last_lng         numeric(10, 7),
  add column if not exists last_location_at timestamptz;

create index if not exists idx_profiles_location
  on public.profiles(last_lat, last_lng)
  where last_lat is not null;
