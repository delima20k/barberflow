-- =============================================================
-- Migration: RLS policies para direct_messages e story_comments
-- =============================================================

-- ─── direct_messages ─────────────────────────────────────────

-- Usuário só vê suas próprias conversas (enviadas OU recebidas)
CREATE POLICY "dm_select_own"
  ON direct_messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
  );

-- Só pode inserir como próprio remetente
CREATE POLICY "dm_insert_own"
  ON direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Só o destinatário pode marcar como lida (UPDATE apenas is_read)
CREATE POLICY "dm_update_read"
  ON direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Ninguém deleta mensagens diretamente (cleanup via função admin)
-- (sem policy de DELETE intencional)

-- ─── story_comments ──────────────────────────────────────────

-- Qualquer usuário autenticado vê comentários de stories ativos
CREATE POLICY "sc_select_authenticated"
  ON story_comments FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM stories s
      WHERE s.id = story_id
        AND s.expires_at > now()
    )
  );

-- Só pode comentar autenticado como próprio remetente
CREATE POLICY "sc_insert_own"
  ON story_comments FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Remetente pode apagar próprio comentário
-- Dono do story (recipient) pode moderar: apagar qualquer comentário
CREATE POLICY "sc_delete_own_or_owner"
  ON story_comments FOR DELETE
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
  );
