-- 20260604000002_chat_realtime_private_channels.sql
-- Autoriza Supabase Realtime private broadcast para o chat canonico da BFF.
-- Cada usuario autenticado pode assinar somente o proprio canal chat.{auth.uid()}.

DROP POLICY IF EXISTS "chat_private_channel_select_own"
  ON realtime.messages;

CREATE POLICY "chat_private_channel_select_own"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'chat.' || auth.uid()::text
  );

COMMENT ON POLICY "chat_private_channel_select_own"
  ON realtime.messages
  IS 'Permite assinatura privada do canal chat.{userId} apenas ao proprio usuario autenticado.';
