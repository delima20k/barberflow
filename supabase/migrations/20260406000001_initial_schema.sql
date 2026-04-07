-- ==============================================================
-- Migration: 20260406000001_initial_schema.sql
-- Descrição: Estrutura inicial do BarberFlow
-- Tabelas: profiles, barbershops, professionals,
--          professional_shop_links, services, chairs,
--          waiting_seats, appointments, queue_entries,
--          attendance_sessions, agreements, transactions
-- ==============================================================

-- ==================== EXTENSIONS ====================
create extension if not exists "uuid-ossp";
create extension if not exists "postgis"; -- geolocalização por raio


-- ==================== PROFILES ====================
-- Espelho de auth.users. 1 linha por usuário criado.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  avatar_path  text,         -- caminho no Supabase Storage (nunca URL direta)
  role         text not null default 'client'
                check (role in ('client', 'professional', 'admin')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Dados públicos do usuário, espelho de auth.users. Role define o tipo de acesso.';

create index idx_profiles_role on public.profiles(role);


-- ==================== BARBERSHOPS ====================
create table if not exists public.barbershops (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id) on delete restrict,
  name           text not null,
  slug           text unique,                -- ex: "barbearia-elite"
  description    text,
  phone          text,
  address        text,
  city           text,
  state          text,
  zip_code       text,
  -- coordenadas para busca geográfica (~2km)
  latitude       numeric(10, 7),
  longitude      numeric(10, 7),
  logo_path      text,                       -- Supabase Storage
  cover_path     text,                       -- Supabase Storage
  is_open        boolean not null default false,
  is_active      boolean not null default true,
  rating_avg     numeric(3,2) not null default 0.00,
  rating_count   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.barbershops is
  'Barbearias cadastradas. Coordenadas para busca por raio. Mídias somente no Storage.';

create index idx_barbershops_owner     on public.barbershops(owner_id);
create index idx_barbershops_city      on public.barbershops(city, state);
create index idx_barbershops_location  on public.barbershops(latitude, longitude);
create index idx_barbershops_active    on public.barbershops(is_active, is_open);


-- ==================== PROFESSIONALS ====================
create table if not exists public.professionals (
  id           uuid primary key references public.profiles(id) on delete cascade,
  bio          text,
  specialties  text[],        -- ex: ARRAY['degradê','barba','social']
  avatar_path  text,
  is_active    boolean not null default true,
  rating_avg   numeric(3,2) not null default 0.00,
  rating_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.professionals is
  'Perfil profissional. Vinculado a profiles. Especialidades em array para filtro rápido.';

create index idx_professionals_active      on public.professionals(is_active);
create index idx_professionals_specialties on public.professionals using gin(specialties);


-- ==================== PROFESSIONAL <-> SHOP LINKS ====================
-- Um profissional pode trabalhar em mais de uma barbearia
create table if not exists public.professional_shop_links (
  id              uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  barbershop_id   uuid not null references public.barbershops(id)  on delete cascade,
  is_active       boolean not null default true,
  joined_at       timestamptz not null default now(),
  unique (professional_id, barbershop_id)
);

create index idx_psl_professional on public.professional_shop_links(professional_id);
create index idx_psl_barbershop   on public.professional_shop_links(barbershop_id);


-- ==================== SERVICES ====================
create table if not exists public.services (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,             -- ex: corte, barba, combo
  price         numeric(8,2) not null default 0,
  duration_min  int not null default 30,   -- duração em minutos
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.services is
  'Serviços oferecidos por barbearia. Duração em minutos para cálculo de agenda.';

create index idx_services_barbershop on public.services(barbershop_id, is_active);
create index idx_services_category   on public.services(category);


-- ==================== CHAIRS ====================
-- Cadeiras ativas de atendimento (não de espera)
create table if not exists public.chairs (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  label         text not null,     -- ex: "Cadeira 1"
  status        text not null default 'livre'
                  check (status in ('livre','ocupada','inativa')),
  professional_id uuid references public.professionals(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index idx_chairs_barbershop on public.chairs(barbershop_id, status);


-- ==================== WAITING SEATS ====================
-- Assentos da sala de espera
create table if not exists public.waiting_seats (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  label         text not null,     -- ex: "Assento A"
  is_occupied   boolean not null default false,
  updated_at    timestamptz not null default now()
);

create index idx_waiting_seats_barbershop on public.waiting_seats(barbershop_id);


-- ==================== APPOINTMENTS ====================
create table if not exists public.appointments (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references public.profiles(id)       on delete restrict,
  professional_id uuid not null references public.professionals(id)  on delete restrict,
  barbershop_id   uuid not null references public.barbershops(id)    on delete restrict,
  service_id      uuid not null references public.services(id)       on delete restrict,
  scheduled_at    timestamptz not null,
  duration_min    int not null default 30,
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','in_progress','done','cancelled','no_show')),
  notes           text,
  price_charged   numeric(8,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.appointments is
  'Agendamentos. Status controla todo o ciclo do atendimento.';

create index idx_appointments_client       on public.appointments(client_id, scheduled_at);
create index idx_appointments_professional on public.appointments(professional_id, scheduled_at);
create index idx_appointments_barbershop   on public.appointments(barbershop_id, scheduled_at);
create index idx_appointments_status       on public.appointments(status);


-- ==================== QUEUE ENTRIES ====================
-- Fila ao vivo (Realtime). Entradas efêmeras — limpar ao final do dia.
create table if not exists public.queue_entries (
  id              uuid primary key default uuid_generate_v4(),
  barbershop_id   uuid not null references public.barbershops(id)   on delete cascade,
  client_id       uuid references public.profiles(id)               on delete set null,
  professional_id uuid references public.professionals(id)          on delete set null,
  chair_id        uuid references public.chairs(id)                 on delete set null,
  position        int not null default 0,
  status          text not null default 'waiting'
                    check (status in ('waiting','in_service','done','cancelled')),
  check_in_at     timestamptz not null default now(),
  served_at       timestamptz,
  done_at         timestamptz
);

comment on table public.queue_entries is
  'Fila em tempo real. Dados efêmeros. Limpar com cron diário ou função agendada.';

create index idx_queue_barbershop on public.queue_entries(barbershop_id, status);
create index idx_queue_position   on public.queue_entries(barbershop_id, position);


-- ==================== ATTENDANCE SESSIONS ====================
-- Registro de sessão do atendimento vinculado à fila
create table if not exists public.attendance_sessions (
  id              uuid primary key default uuid_generate_v4(),
  queue_entry_id  uuid not null references public.queue_entries(id) on delete restrict,
  appointment_id  uuid references public.appointments(id)           on delete set null,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  chair_id        uuid not null references public.chairs(id)        on delete restrict,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  notes           text
);

create index idx_sessions_professional on public.attendance_sessions(professional_id, started_at);
create index idx_sessions_chair        on public.attendance_sessions(chair_id);


-- ==================== AGREEMENTS ====================
-- Acordos financeiros entre profissional e barbearia
create table if not exists public.agreements (
  id              uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  barbershop_id   uuid not null references public.barbershops(id)   on delete cascade,
  type            text not null default 'percentage'
                    check (type in ('percentage','fixed','rent')),
  value           numeric(8,2) not null default 0,  -- % ou R$ fixo
  is_active       boolean not null default true,
  valid_from      date not null default current_date,
  valid_until     date,
  notes           text,
  created_at      timestamptz not null default now()
);

create index idx_agreements_professional on public.agreements(professional_id, is_active);
create index idx_agreements_barbershop   on public.agreements(barbershop_id, is_active);


-- ==================== TRANSACTIONS ====================
-- Registro financeiro de cada atendimento
create table if not exists public.transactions (
  id              uuid primary key default uuid_generate_v4(),
  barbershop_id   uuid not null references public.barbershops(id)   on delete restrict,
  appointment_id  uuid references public.appointments(id)           on delete set null,
  professional_id uuid references public.professionals(id)          on delete set null,
  client_id       uuid references public.profiles(id)               on delete set null,
  amount          numeric(10,2) not null,
  type            text not null default 'revenue'
                    check (type in ('revenue','refund','commission','expense')),
  payment_method  text,       -- ex: pix, dinheiro, cartao
  status          text not null default 'pending'
                    check (status in ('pending','paid','cancelled','refunded')),
  notes           text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.transactions is
  'Movimentação financeira. Não salvar dados sensíveis de cartão — apenas método.';

create index idx_transactions_barbershop on public.transactions(barbershop_id, created_at);
create index idx_transactions_status     on public.transactions(status);


-- ==================== FUNÇÃO: updated_at automático ====================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Aplicar o trigger em todas as tabelas com updated_at
do $$ declare
  t text;
begin
  foreach t in array array[
    'profiles','barbershops','professionals',
    'services','appointments'
  ] loop
    execute format(
      'create or replace trigger trg_%s_updated_at
       before update on public.%s
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;
