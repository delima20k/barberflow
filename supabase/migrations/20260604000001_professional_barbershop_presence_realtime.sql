-- ============================================================
-- Habilita Supabase Realtime para professional_barbershop_presence
--
-- Sem isto, mudancas de is_available NAO disparam postgres_changes,
-- e o status Ativo/Inativo (e o bloqueio de cadeiras no app cliente)
-- so atualiza apos refresh manual.
--
-- REPLICA IDENTITY FULL: garante que UPDATE/DELETE carreguem a linha
-- completa no payload (mesmo padrao de 20260507000005_notifications_realtime.sql).
-- RLS de SELECT ja e publica (pbp_select_public), entao o canal entrega eventos.
-- ============================================================

ALTER TABLE public.professional_barbershop_presence REPLICA IDENTITY FULL;

-- Idempotente: ALTER PUBLICATION ... ADD TABLE falha se a tabela ja for membro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_barbershop_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_barbershop_presence;
  END IF;
END $$;
