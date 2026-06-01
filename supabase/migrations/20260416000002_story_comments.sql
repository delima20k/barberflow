-- =============================================================
-- Migration: story_comments
-- Comentários feitos sobre um story específico.
-- ON DELETE CASCADE: quando o story for removido (ou expirado
-- e limpo), todos os comentários são automaticamente apagados.
-- recipient_id = dono do story (para notificações e RLS).
-- =============================================================

CREATE TABLE IF NOT EXISTS story_comments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id      UUID        NOT NULL REFERENCES stories(id)  ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sc_story
  ON story_comments (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sc_recipient
  ON story_comments (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sc_sender
  ON story_comments (sender_id, created_at DESC);

-- RLS habilitado
ALTER TABLE story_comments ENABLE ROW LEVEL SECURITY;
