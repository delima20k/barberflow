-- =============================================================
-- Migration: story cleanup function
--
-- cleanup_expired_story_comments():
--   Remove comentários de stories expirados.
--   O row do story É MANTIDO com todos os seus metadados
--   (views_count, thumbnail_path, expires_at, etc.).
--   Apenas o conteúdo efêmero (comentários) é apagado.
--
-- Chamada pela Edge Function cleanup-story-comments via rpc().
-- Pode ser agendada externamente (GitHub Actions, Vercel Cron).
-- =============================================================

CREATE OR REPLACE FUNCTION cleanup_expired_story_comments()
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Remove comentários cujo story já expirou
  DELETE FROM story_comments
  WHERE story_id IN (
    SELECT id FROM stories WHERE expires_at < now()
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, now();
END;
$$;

-- Conceder execução apenas ao role service_role (Edge Functions)
REVOKE EXECUTE ON FUNCTION cleanup_expired_story_comments() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cleanup_expired_story_comments() TO service_role;

-- ─── Função auxiliar: cleanup completo (story row + comentários) ──
-- Chamada quando o dono decide apagar um story expirado.
-- Uso voluntário — não roda automaticamente.
CREATE OR REPLACE FUNCTION delete_expired_stories()
RETURNS TABLE (deleted_stories BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- CASCADE apaga story_comments automaticamente
  DELETE FROM stories WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count, now();
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_expired_stories() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_expired_stories() TO service_role;
