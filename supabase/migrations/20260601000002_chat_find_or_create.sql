-- ==============================================================
-- Migration: 20260601000002_chat_find_or_create.sql
-- Descrição: Função atômica para encontrar ou criar conversa
--            direta entre dois usuários, índice para performance
--            e políticas RLS para acesso direto via SDK.
-- ==============================================================

-- ── Função find-or-create (atômica, evita race condition) ────
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  -- Busca conversa direta ativa entre exatamente esses dois participantes
  SELECT c.id INTO v_conv_id
  FROM chat_conversations c
  WHERE c.type = 'direct'
    AND c.archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = c.id AND user_id = p_user_a AND left_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = c.id AND user_id = p_user_b AND left_at IS NULL
    )
    AND (
      SELECT COUNT(*) FROM chat_participants cp
      WHERE cp.conversation_id = c.id AND cp.left_at IS NULL
    ) = 2
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Cria nova conversa com dois participantes
  INSERT INTO chat_conversations (type, created_by)
  VALUES ('direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO chat_participants (conversation_id, user_id, role)
  VALUES
    (v_conv_id, p_user_a, 'owner'),
    (v_conv_id, p_user_b, 'member');

  RETURN v_conv_id;
END;
$$;

-- ── Função list_conversations_for_user ──────────────────────
CREATE OR REPLACE FUNCTION public.list_conversations_for_user(
  p_user_id uuid
)
RETURNS TABLE (
  id                      uuid,
  type                    text,
  created_at              timestamptz,
  last_message_body       text,
  last_message_at         timestamptz,
  last_message_sender_id  uuid,
  unread_count            bigint,
  other_participant_ids   uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.type,
    c.created_at,
    lm.body           AS last_message_body,
    lm.created_at     AS last_message_at,
    lm.sender_id      AS last_message_sender_id,
    COALESCE(unread.cnt, 0)::bigint AS unread_count,
    ARRAY(
      SELECT op.user_id
      FROM chat_participants op
      WHERE op.conversation_id = c.id
        AND op.user_id <> p_user_id
        AND op.left_at IS NULL
    ) AS other_participant_ids
  FROM chat_conversations c
  JOIN chat_participants me
    ON me.conversation_id = c.id
   AND me.user_id = p_user_id
   AND me.left_at IS NULL
  LEFT JOIN LATERAL (
    SELECT body, created_at, sender_id
    FROM chat_messages
    WHERE conversation_id = c.id
      AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM chat_messages m2
    WHERE m2.conversation_id = c.id
      AND m2.sender_id <> p_user_id
      AND m2.deleted_at IS NULL
      AND (
        me.last_read_message_id IS NULL
        OR m2.created_at > (
          SELECT created_at FROM chat_messages
          WHERE id = me.last_read_message_id
        )
      )
  ) unread ON true
  WHERE c.archived_at IS NULL
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC NULLS LAST;
$$;

-- ── Índice para lateral subquery de última mensagem ──────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_latest
  ON public.chat_messages(conversation_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- ── RLS: acesso direto via SDK (BFF usa service role, ignora) ─
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select"
  ON public.chat_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants
      WHERE conversation_id = id
        AND user_id = auth.uid()
        AND left_at IS NULL
    )
  );

DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
CREATE POLICY "chat_participants_select"
  ON public.chat_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id FROM public.chat_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );
