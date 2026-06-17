-- =============================================================
-- Migration: media_files cleanup state
--
-- Adiciona colunas de rastreamento de limpeza R2 à tabela media_files.
-- Permite retry atômico e idempotente de exclusões no Cloudflare R2.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_media_files_cleanup;
--   DROP FUNCTION IF EXISTS rpc_increment_media_cleanup_attempt(uuid,text,timestamptz);
--   ALTER TABLE public.media_files
--     DROP COLUMN IF EXISTS cleanup_status,
--     DROP COLUMN IF EXISTS cleanup_attempts,
--     DROP COLUMN IF EXISTS cleanup_last_error,
--     DROP COLUMN IF EXISTS cleanup_last_attempt_at,
--     DROP COLUMN IF EXISTS cleanup_next_attempt_at;
-- =============================================================

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS cleanup_status         text
    CHECK (cleanup_status IN ('pending', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS cleanup_attempts       smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleanup_last_error     text,
  ADD COLUMN IF NOT EXISTS cleanup_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_next_attempt_at timestamptz;

-- Índice parcial para a query de retry (status + próxima tentativa)
-- Cobre apenas linhas com cleanup pendente — tamanho mínimo
CREATE INDEX IF NOT EXISTS idx_media_files_cleanup
  ON public.media_files (cleanup_status, cleanup_next_attempt_at)
  WHERE cleanup_status IS NOT NULL;

-- RPC atômica para incremento de tentativas (evita read-modify-write no Node)
-- Calcula cleanup_next_attempt_at com backoff exponencial passado pelo caller
CREATE OR REPLACE FUNCTION rpc_increment_media_cleanup_attempt(
  p_media_id        uuid,
  p_error           text,
  p_next_attempt_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.media_files SET
    cleanup_status            = 'pending',
    cleanup_attempts          = cleanup_attempts + 1,
    cleanup_last_error        = p_error,
    cleanup_last_attempt_at   = now(),
    cleanup_next_attempt_at   = p_next_attempt_at
  WHERE id = p_media_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION rpc_increment_media_cleanup_attempt(uuid, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_increment_media_cleanup_attempt(uuid, text, timestamptz) TO service_role;
