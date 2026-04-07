-- ==============================================================
-- Migration: 20260406000004_storage_buckets.sql
-- Descrição: Buckets do Supabase Storage + políticas de acesso
-- ==============================================================


-- ==================== BUCKETS ====================

-- Avatares de usuários (público)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,   -- 2MB
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

-- Logos e capas de barbearias (público)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barbershops',
  'barbershops',
  true,
  5242880,   -- 5MB
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

-- Stories — vídeos e imagens de 24h (público)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  52428800,  -- 50MB (vídeo até 30s / 720p)
  array['video/mp4','video/webm','image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

-- Portfólio de trabalhos (público)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760,  -- 10MB
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;


-- ===========================================================
-- POLÍTICAS DE STORAGE
-- ===========================================================

-- AVATARS: qualquer um lê, dono faz upload no próprio path
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- BARBERSHOPS: público lê, dono escreve
create policy "barbershops_public_read"
  on storage.objects for select
  using (bucket_id = 'barbershops');

create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- STORIES: público lê, dono escreve
create policy "stories_public_read"
  on storage.objects for select
  using (bucket_id = 'stories');

create policy "stories_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'stories' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "stories_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'stories' and
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- PORTFOLIO: público lê, dono escreve
create policy "portfolio_public_read"
  on storage.objects for select
  using (bucket_id = 'portfolio');

create policy "portfolio_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'portfolio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "portfolio_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'portfolio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
