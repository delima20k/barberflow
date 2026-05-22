-- 20260522000003_chat_bounded_context.sql
-- Contexto canonico de chat atras da BFF.

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'owner')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  left_at         timestamptz,
  last_read_message_id uuid,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  body              text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  encrypted_payload jsonb,
  e2e_key_version   integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  retention_until   timestamptz
);

CREATE TABLE IF NOT EXISTS public.chat_message_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES public.media_files(id) ON DELETE RESTRICT,
  variant    text NOT NULL DEFAULT 'original',
  kind       text NOT NULL DEFAULT 'media',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, media_id, variant)
);

CREATE TABLE IF NOT EXISTS public.chat_message_statuses (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('saved', 'published', 'delivered', 'read', 'failed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.chat_mute_rules (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_id
  ON public.chat_messages(sender_id, client_message_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_desc
  ON public.chat_messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user_active
  ON public.chat_participants(user_id, conversation_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_attachments_media
  ON public.chat_message_attachments(media_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_retention
  ON public.chat_messages(retention_until)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.has_chat_block(p_left_user_id uuid, p_right_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_blocks b
     WHERE (b.blocker_id = p_left_user_id AND b.blocked_id = p_right_user_id)
        OR (b.blocker_id = p_right_user_id AND b.blocked_id = p_left_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.count_chat_pair_messages(
  p_sender_id uuid,
  p_recipient_ids uuid[],
  p_window_seconds integer
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
    FROM public.chat_messages m
   WHERE m.sender_id = p_sender_id
     AND m.created_at >= now() - make_interval(secs => p_window_seconds)
     AND EXISTS (
       SELECT 1
         FROM public.chat_participants cp
        WHERE cp.conversation_id = m.conversation_id
          AND cp.user_id = ANY(p_recipient_ids)
          AND cp.left_at IS NULL
     );
$$;

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

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mute_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chat_messages IS 'Mensagens canonicas do chat. Leitura otimizada por (conversation_id, created_at desc, id desc).';
COMMENT ON COLUMN public.chat_messages.client_message_id IS 'Chave idempotente enviada pelo cliente por mensagem.';
COMMENT ON COLUMN public.chat_messages.encrypted_payload IS 'Ponto de extensao para E2E; nao usado ate habilitar IMessageCipher.';
