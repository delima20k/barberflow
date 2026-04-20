-- ==============================================================
-- Migration: 20260420000002_storage_avatar_update.sql
-- Descrição: Adiciona policy UPDATE para o bucket avatars.
--            Sem ela, o re-upload de avatar (upsert) falha com RLS violation.
-- ==============================================================

create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
