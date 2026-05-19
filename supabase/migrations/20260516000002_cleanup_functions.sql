-- ==============================================================
-- Migration: 20260516000002_cleanup_functions.sql
-- Descrição: Funções de limpeza para tabelas de alta rotatividade.
--
-- Tabelas-alvo:
--   queue_entries   — entradas finalizadas com mais de 7 dias
--   notifications   — notificações lidas com mais de 30 dias
--
-- Como invocar (via Supabase Edge Function, Vercel Cron ou GitHub Actions):
--   SELECT * FROM cleanup_queue_entries_old();
--   SELECT * FROM cleanup_notifications_old();
--
-- Alternativa com pg_cron (se extensão habilitada no projeto):
--   SELECT cron.schedule('cleanup_queue', '0 3 * * *',
--     'SELECT cleanup_queue_entries_old()');
-- ==============================================================

-- ── 1. Limpeza de queue_entries finalizadas ───────────────────
--
-- Remove entradas com status terminal (done, cancelled) com mais
-- de 7 dias. Entradas 'waiting' e 'in_service' nunca são removidas.

CREATE OR REPLACE FUNCTION public.cleanup_queue_entries_old(
  p_dias INT DEFAULT 7
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM public.queue_entries
  WHERE status IN ('done', 'cancelled')
    AND check_in_at < NOW() - (p_dias || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) TO service_role;


-- ── 2. Limpeza de notificações lidas antigas ─────────────────
--
-- Remove notificações marcadas como lidas (is_read = true) com
-- mais de 30 dias. Notificações não lidas são preservadas.

CREATE OR REPLACE FUNCTION public.cleanup_notifications_old(
  p_dias INT DEFAULT 30
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM public.notifications
  WHERE is_read = TRUE
    AND created_at < NOW() - (p_dias || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) TO service_role;


-- ── 3. Limpeza combinada (atalho para cron único) ─────────────

CREATE OR REPLACE FUNCTION public.cleanup_all_old_data()
RETURNS TABLE (tabela TEXT, cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT 'queue_entries'::TEXT, c.cleaned_count, c.cleaned_at
    FROM cleanup_queue_entries_old() AS c;

  RETURN QUERY
    SELECT 'notifications'::TEXT, c.cleaned_count, c.cleaned_at
    FROM cleanup_notifications_old() AS c;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_all_old_data() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_all_old_data() TO service_role;
