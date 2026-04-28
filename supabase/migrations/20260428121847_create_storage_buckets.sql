-- =============================================================
-- Migration: 20260428121847_create_storage_buckets.sql
--
-- Cria o bucket Supabase Storage para imagens estáticas e
-- configura as políticas de acesso (RLS) adequadas.
--
-- Contextos de uso: avatars, services, portfolio
-- Contextos que NÃO usam este bucket: stories (→ Cloudflare R2)
--
-- Convenção de path no bucket:
--   {contexto}/{user_id}/{uuid}.{ext}
--   Exemplos:
--     avatars/550e8400-e29b-41d4-a716-446655440000/a1b2c3.webp
--     services/550e8400-e29b-41d4-a716-446655440000/d4e5f6.jpg
--     portfolio/550e8400-e29b-41d4-a716-446655440000/g7h8i9.png
--
-- RLS: qualquer um pode ler (bucket público);
--      somente o dono pode fazer upload/deletar (extraído do path).
-- =============================================================

-- ─── Bucket ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-images',
  'media-images',
  true,
  10485760,  -- 10 MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── RLS — Leitura pública ────────────────────────────────────
-- Qualquer visitante pode ver imagens de perfil, serviços e portfólio.
CREATE POLICY "media-images: leitura pública"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media-images');

-- ─── RLS — Upload pelo dono ───────────────────────────────────
-- O segundo segmento do path é o user_id (ex: avatars/{user_id}/arquivo.webp).
-- Apenas o usuário autenticado cujo UID coincide pode fazer upload.
CREATE POLICY "media-images: upload pelo dono"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );

-- ─── RLS — Atualização pelo dono ─────────────────────────────
-- Necessário para upsert / substituição de imagem.
CREATE POLICY "media-images: atualização pelo dono"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );

-- ─── RLS — Deleção pelo dono ──────────────────────────────────
CREATE POLICY "media-images: deleção pelo dono"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );
