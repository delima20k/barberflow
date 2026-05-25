-- Global image optimization metadata for media variants.
-- Bytes stay in Supabase Storage; Postgres stores only metadata for CDN/cache decisions.

alter table public.media_variants
  add column if not exists width integer check (width is null or width > 0),
  add column if not exists height integer check (height is null or height > 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.media_variants.width is 'Optimized variant width in pixels.';
comment on column public.media_variants.height is 'Optimized variant height in pixels.';
comment on column public.media_variants.metadata is 'Non-sensitive optimization metadata such as preset, mimeType and encoded size.';

-- rollback:
-- alter table public.media_variants
--   drop column if exists metadata,
--   drop column if exists height,
--   drop column if exists width;
