-- 20260626000001_story_messages.sql
-- Mensagens privadas vinculadas a stories, seguindo o modelo seguro do portfolio.

CREATE TABLE IF NOT EXISTS public.story_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          uuid        NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  media_id          uuid        NOT NULL,
  recipient_id      uuid        NOT NULL,
  sender_id         uuid        NOT NULL,
  body              text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  client_message_id text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_messages_story
  ON public.story_messages(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_messages_media
  ON public.story_messages(media_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_messages_recipient
  ON public.story_messages(recipient_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_messages_client_dedupe
  ON public.story_messages(sender_id, story_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

ALTER TABLE public.story_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_messages_recipient_select" ON public.story_messages;
CREATE POLICY "story_messages_recipient_select"
  ON public.story_messages FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "story_messages_sender_insert" ON public.story_messages;
CREATE POLICY "story_messages_sender_insert"
  ON public.story_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

COMMENT ON TABLE public.story_messages
  IS 'Mensagens privadas enviadas em stories, lidas pelo dono/profissional do story.';
