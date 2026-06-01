-- =============================================================
-- 20260517000001_drop_direct_messages.sql
--
-- Remove a tabela direct_messages e suas policies/índices.
-- Mensagens diretas passam a ser P2P com E2E encryption —
-- nenhum conteúdo de mensagem é armazenado no banco.
-- =============================================================

-- Políticas RLS
DROP POLICY IF EXISTS "dm_select_own"   ON direct_messages;
DROP POLICY IF EXISTS "dm_insert_own"   ON direct_messages;
DROP POLICY IF EXISTS "dm_update_read"  ON direct_messages;

-- Índices (DROP INDEX não usa IF EXISTS ON tabela — deve ser standalone)
DROP INDEX IF EXISTS idx_dm_conversation;
DROP INDEX IF EXISTS idx_dm_inbox;
DROP INDEX IF EXISTS idx_dm_story_ref;

-- Tabela
DROP TABLE IF EXISTS direct_messages;
