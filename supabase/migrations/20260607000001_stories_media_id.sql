-- 20260607000001_stories_media_id.sql
-- Adiciona media_id à tabela stories para linkar com media_files (R2 pipeline).
--
-- Mudanças:
--   1. Adiciona coluna nullable media_id → FK para media_files(id) ON DELETE SET NULL
--   2. Cria índice parcial para evitar penalidade em stories sem R2 (legados)
--
-- Compatibilidade:
--   - media_id nullable: stories anteriores (storage_path puro) continuam funcionando
--   - Não altera storage_path nem thumbnail_path
--   - Não modifica RLS existente
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_stories_media_id;
--   ALTER TABLE public.stories DROP COLUMN IF EXISTS media_id;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS media_id UUID REFERENCES public.media_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stories_media_id
  ON public.stories(media_id)
  WHERE media_id IS NOT NULL;

COMMENT ON COLUMN public.stories.media_id IS
  'FK para media_files. Preenchido em stories novos (R2). NULL mantém compatibilidade com storage_path legado.';
