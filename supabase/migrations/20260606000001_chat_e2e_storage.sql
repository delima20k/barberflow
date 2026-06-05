-- 20260606000001_chat_e2e_storage.sql
-- Habilita criptografia E2E no storage do chat.
--
-- Mudanças:
--   1. Atualiza get_chat_messages_reverse para retornar encrypted_payload
--      (necessário para descriptografia no browser ao carregar histórico).
--   2. Adiciona índice parcial em encrypted_payload para conversas cifradas
--      (melhora contagem/listagem sem tocar em mensagens legadas).
--   3. Sem novas tabelas: encrypted_payload jsonb e e2e_key_version integer
--      já existem em chat_messages desde 20260522000003.
--   4. body permanece NOT NULL DEFAULT '' — mensagens cifradas usam body = ''.
--
-- Rollback:
--   Recriar get_chat_messages_reverse sem encrypted_payload (versão anterior
--   definida em 20260522000003_chat_bounded_context.sql).
-- ============================================================

-- 1. Atualiza RPC para incluir encrypted_payload no retorno
CREATE OR REPLACE FUNCTION public.get_chat_messages_reverse(
  p_conversation_id uuid,
  p_limit integer DEFAULT 30,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_message_id text,
  body text,
  encrypted_payload jsonb,
  e2e_key_version integer,
  created_at timestamptz,
  deleted_at timestamptz,
  retention_until timestamptz,
  attachments jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT m.id,
         m.conversation_id,
         m.sender_id,
         m.client_message_id,
         CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
         CASE WHEN m.deleted_at IS NULL THEN m.encrypted_payload ELSE NULL END AS encrypted_payload,
         m.e2e_key_version,
         m.created_at,
         m.deleted_at,
         m.retention_until,
         COALESCE(
           jsonb_agg(
             jsonb_build_object('media_id', a.media_id, 'variant', a.variant, 'kind', a.kind)
             ORDER BY a.created_at
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'::jsonb
         ) AS attachments
    FROM public.chat_messages m
    LEFT JOIN public.chat_message_attachments a ON a.message_id = m.id
   WHERE m.conversation_id = p_conversation_id
     AND (
       p_cursor_created_at IS NULL
       OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     )
   GROUP BY m.id
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- 2. Índice parcial para mensagens criptografadas (não penaliza mensagens legadas)
CREATE INDEX IF NOT EXISTS idx_chat_messages_encrypted
  ON public.chat_messages(conversation_id, created_at DESC)
  WHERE encrypted_payload IS NOT NULL;

COMMENT ON FUNCTION public.get_chat_messages_reverse IS
  'Retorna mensagens de uma conversa em ordem DESC com cursor. Inclui encrypted_payload para E2E client-side.';
