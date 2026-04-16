-- =============================================================
-- Migration: direct_messages
-- Mensagens diretas entre usuários (tipo chat 1-a-1).
-- story_ref_id é SET NULL ao expirar o story — a conversa
-- permanece mesmo após a mídia desaparecer.
-- =============================================================

CREATE TABLE IF NOT EXISTS direct_messages (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  story_ref_id  UUID        REFERENCES stories(id)  ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS idx_dm_conversation
  ON direct_messages (sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_inbox
  ON direct_messages (recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_story_ref
  ON direct_messages (story_ref_id) WHERE story_ref_id IS NOT NULL;

-- RLS habilitado
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
