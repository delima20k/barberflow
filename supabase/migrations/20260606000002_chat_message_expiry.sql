-- 20260606000002_chat_message_expiry.sql
-- Expiração automática de mensagens de chat após 7 dias.
--
-- Estratégia: função SQL chamada pelo task scheduler do BFF (chat.purge-expired-messages)
--   diariamente às 03:00 UTC. Não usa pg_cron para manter o controle no BFF.
--
-- Regra: DELETE em chat_messages WHERE created_at < now() - N dias
--   - N padrão = 7 (configurável via parâmetro)
--   - Aplica-se a TODAS as mensagens, independente de soft-delete ou encrypted_payload
--   - Cascade ON DELETE apaga automaticamente chat_message_attachments,
--     chat_message_statuses e chat_read_receipts vinculados
--   - Conversas, participantes e usuários NÃO são apagados
--
-- Segurança:
--   - Chamada pelo BFF usando service role key (bypassa RLS)
--   - Parâmetro com validação de range (1–365 dias) para prevenir abuso
--   - Endpoint administrativo do scheduler protegido por SchedulerAdminMiddleware
--   - Logs registram apenas contagem, nunca conteúdo
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.purge_expired_chat_messages(integer);
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages(
  p_older_than_days integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_older_than_days < 1 OR p_older_than_days > 365 THEN
    RAISE EXCEPTION 'p_older_than_days deve estar entre 1 e 365 (recebido: %)', p_older_than_days;
  END IF;

  -- Deleta mensagens com EXATAMENTE p_older_than_days ou mais (inclusivo)
  DELETE FROM public.chat_messages
  WHERE created_at <= now() - make_interval(days => p_older_than_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_chat_messages IS
  'Remove permanentemente mensagens de chat com mais de N dias (padrão: 7). '
  'Chamado pelo BFF scheduler task chat.purge-expired-messages às 03:00 UTC. '
  'Cascade apaga attachments, statuses e receipts. Conversas/participantes preservados.';
