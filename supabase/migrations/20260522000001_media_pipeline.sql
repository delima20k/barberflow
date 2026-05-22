-- Canonical async media pipeline metadata.
-- Bytes stay in Storage. BFF service_role owns reserve/confirm/publish writes.

alter table public.media_files
  add column if not exists source_path text,
  add column if not exists declared_mime text,
  add column if not exists declared_size_bytes integer,
  add column if not exists source_mime text,
  add column if not exists source_size_bytes integer,
  add column if not exists privacy text not null default 'private'
    check (privacy in ('public', 'private')),
  add column if not exists status text not null default 'published'
    check (status in ('reserved', 'uploaded', 'published', 'blocked', 'orphaned', 'deleted')),
  add column if not exists perceptual_hash text,
  add column if not exists duplicate_of uuid references public.media_files(id) on delete set null,
  add column if not exists published_at timestamptz;

alter table public.media_files
  alter column public_url drop not null;

update public.media_files
set source_path = coalesce(source_path, path),
    source_mime = coalesce(source_mime, content_type),
    source_size_bytes = coalesce(source_size_bytes, tamanho_bytes),
    privacy = coalesce(privacy, 'public'),
    status = coalesce(status, 'published')
where source_path is null
   or source_mime is null
   or source_size_bytes is null;

create index if not exists idx_media_files_phash_owner
  on public.media_files(owner_id, perceptual_hash)
  where perceptual_hash is not null;

create index if not exists idx_media_files_status_created
  on public.media_files(status, created_at);

create table if not exists public.media_variants (
  id uuid primary key default uuid_generate_v4(),
  media_id uuid not null references public.media_files(id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  storage_path text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (media_id, name, version)
);

create index if not exists idx_media_variants_media
  on public.media_variants(media_id, name, version desc);

alter table public.media_variants enable row level security;

create policy "media_variants_owner_select"
  on public.media_variants for select
  using (
    exists (
      select 1 from public.media_files mf
      where mf.id = media_id
        and mf.owner_id = auth.uid()
    )
  );

-- Retention candidates:
-- reserved/uploaded older than 24h are orphaned upload reservations;
-- orphaned/deleted objects and previous variant versions can be GC'd by worker.
