-- =============================================================
-- Migration: 20260428130605_create_barbershop_bucket.sql
--
-- Cria o bucket media-barbershop para imagens de barbearia
-- (logo, cover, banner) sem processamento server-side.
--
-- CONVENÇÃO DE PATH: {tipo}/{user_id}/{uuid}.{ext}
-- RLS owner check: auth.uid()::text = split_part(name, '/', 2)
-- =============================================================

-- ── Bucket ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-barbershop',
  'media-barbershop',
  true,
  5242880,  -- 5 MB (o logo tem limite menor, validado no backend)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS: leitura pública ──────────────────────────────────────
CREATE POLICY "media-barbershop: leitura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-barbershop');

-- ── RLS: insert pelo dono ─────────────────────────────────────
CREATE POLICY "media-barbershop: upload pelo dono"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-barbershop'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

-- ── RLS: update pelo dono ─────────────────────────────────────
CREATE POLICY "media-barbershop: atualização pelo dono"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

-- ── RLS: delete pelo dono ─────────────────────────────────────
CREATE POLICY "media-barbershop: deleção pelo dono"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );
