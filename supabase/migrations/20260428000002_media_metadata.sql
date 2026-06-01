-- ==============================================================
-- Migration: 20260428000002_media_metadata.sql
-- Descrição: Tabela de metadados de mídia para o sistema híbrido
--            P2P + Cloudflare R2 + Supabase.
--
--            Os arquivos em si residem no Cloudflare R2.
--            Esta tabela guarda APENAS os metadados:
--            quem enviou, onde está (path + publicUrl), tipo, tamanho.
--
-- Contextos: stories | avatars | services | portfolio
-- ==============================================================

-- ── Tabela principal ─────────────────────────────────────────
create table if not exists public.media_files (
  id            uuid        primary key default uuid_generate_v4(),
  owner_id      uuid        not null references auth.users(id) on delete cascade,
  contexto      text        not null,   -- stories | avatars | services | portfolio
  path          text        not null unique,   -- chave no bucket R2 (ex: avatars/uuid/uuid.webp)
  public_url    text        not null,   -- URL pública no R2 CDN
  content_type  text,
  tamanho_bytes int,
  metadata      jsonb,                  -- dados extras livres (barbershopId, title, etc.)
  created_at    timestamptz not null default now()
);

comment on table public.media_files is
  'Metadados de mídia armazenada no Cloudflare R2. '
  'O arquivo em si NÃO está no Supabase — apenas path e URL pública.';

comment on column public.media_files.contexto   is 'Contexto de uso: stories | avatars | services | portfolio';
comment on column public.media_files.path        is 'Chave no bucket R2 (ex: services/uuid/uuid.webp)';
comment on column public.media_files.public_url  is 'URL pública no R2 CDN (via R2_PUBLIC_URL)';
comment on column public.media_files.metadata    is 'Dados extras opcionais (barbershopId, title, etc.)';

-- ── Constraint: contexto válido ──────────────────────────────
alter table public.media_files
  add constraint media_files_contexto_check
  check (contexto in ('stories', 'avatars', 'services', 'portfolio'));

-- ── Índices ───────────────────────────────────────────────────
create index idx_media_files_owner    on public.media_files(owner_id);
create index idx_media_files_contexto on public.media_files(owner_id, contexto);
create index idx_media_files_created  on public.media_files(created_at desc);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.media_files enable row level security;

-- Leitura: dono pode ler seus próprios registros
create policy "media_files_owner_select"
  on public.media_files for select
  using (owner_id = auth.uid());

-- Inserção: bloqueada para o role anon/authenticated —
-- apenas o backend (service_role) pode inserir após confirmar upload no R2.
-- Isso impede que o frontend registre paths arbitrários sem validação.
create policy "media_files_service_insert"
  on public.media_files for insert
  with check (false);   -- service_role bypassa RLS, anon/authenticated não inserem diretamente

-- Deleção: dono pode deletar seus registros
-- (o backend valida ownership antes de chamar DELETE no R2)
create policy "media_files_owner_delete"
  on public.media_files for delete
  using (owner_id = auth.uid());
