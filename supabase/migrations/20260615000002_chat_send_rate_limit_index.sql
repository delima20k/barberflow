-- 20260615000002_chat_send_rate_limit_index.sql
-- Otimiza o caminho de envio do chat: count_chat_pair_messages filtra por
-- sender_id e janela de created_at antes de validar participantes.
-- rollback: DROP INDEX IF EXISTS public.idx_chat_messages_sender_recent;

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_recent
  ON public.chat_messages(sender_id, created_at DESC, conversation_id);

COMMENT ON INDEX public.idx_chat_messages_sender_recent IS
  'Acelera count_chat_pair_messages no rate limit do envio de chat por remetente e janela recente.';
