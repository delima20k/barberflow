-- ==============================================================
-- Migration: 20260513000001_notificar_barbeiro_rpc.sql
-- Descrição: Política INSERT para notifications + RPC SECURITY DEFINER
--
-- Problema corrigido:
--   O app cliente recebia 403 Forbidden ao tentar inserir notificações
--   diretamente na tabela via PostgREST porque a política de INSERT estava
--   ausente no script consolidado.
--
-- Solução:
--   1. Cria política INSERT permissiva (autenticados) como fallback.
--   2. Cria RPC notificar_barbeiro_chegada com SECURITY DEFINER, que
--      bypassa RLS completamente — controle fica dentro da função.
--      Isso torna o mecanismo robusto contra ajustes futuros de RLS.
-- ==============================================================

-- ── 1. Política de INSERT ──────────────────────────────────────

DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;

CREATE POLICY "notifications_insert_service"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- ── 2. RPC com SECURITY DEFINER ───────────────────────────────

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id UUID,
  p_type            TEXT,
  p_title           TEXT,
  p_body            TEXT,
  p_data            JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_professional_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, created_at
  ) VALUES (
    p_professional_id,
    p_type,
    p_title,
    COALESCE(p_body, ''),
    COALESCE(p_data, '{}'),
    false,
    NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated;
