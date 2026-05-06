-- Migration: 20260506000001_queue_entry_services.sql
-- Cria tabela de serviços selecionados por entrada na fila.
-- Registra quais serviços o cliente escolheu ao entrar na fila.

-- ═══════════════════════════════════════════════════════════
-- TABELA
-- ═══════════════════════════════════════════════════════════
create table if not exists public.queue_entry_services (
  id             uuid        primary key default uuid_generate_v4(),
  queue_entry_id uuid        not null references public.queue_entries(id) on delete cascade,
  barbershop_id  uuid        not null references public.barbershops(id)   on delete cascade,
  service_id     uuid        not null references public.services(id)      on delete cascade,
  created_at     timestamptz not null default now(),

  unique (queue_entry_id, service_id)
);

comment on table public.queue_entry_services is
  'Serviços escolhidos pelo cliente ao entrar na fila. Apagados em cascata com a entrada.';

create index idx_qes_entry   on public.queue_entry_services(queue_entry_id);
create index idx_qes_service on public.queue_entry_services(service_id);

-- ═══════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════
alter table public.queue_entry_services enable row level security;

-- Leitura pública (mesma política de queue_entries)
create policy "qes_select_public"
  on public.queue_entry_services for select
  using (true);

-- Inserção: apenas o próprio cliente ou profissional/dono da barbearia
create policy "qes_insert"
  on public.queue_entry_services for insert
  with check (
    auth.uid() = (
      select client_id from public.queue_entries
      where id = queue_entry_id
    )
    or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

-- Deleção: apenas dono da barbearia ou o próprio cliente
create policy "qes_delete"
  on public.queue_entry_services for delete
  using (
    auth.uid() = (
      select client_id from public.queue_entries
      where id = queue_entry_id
    )
    or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

-- ═══════════════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.queue_entry_services;
