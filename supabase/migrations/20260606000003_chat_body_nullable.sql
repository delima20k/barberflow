-- 20260606000003_chat_body_nullable.sql
-- Torna body nullable em chat_messages para distinguir semânticamente:
--   NULL  = mensagem cifrada (encrypted_payload presente, sem texto puro)
--   ''    = mensagem soft-deletada (body apagado, deleted_at definido)
--   texto = mensagem legada com body em claro (compatibilidade retroativa)
--
-- Não quebra dados existentes: linhas com body='' mantêm o valor.
-- Cascade e RLS não são afetados.
--
-- Rollback:
--   UPDATE public.chat_messages SET body = '' WHERE body IS NULL;
--   ALTER TABLE public.chat_messages ALTER COLUMN body SET NOT NULL;
--   ALTER TABLE public.chat_messages ALTER COLUMN body SET DEFAULT '';
-- ============================================================

ALTER TABLE public.chat_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN body DROP DEFAULT;

COMMENT ON COLUMN public.chat_messages.body IS
  'NULL = mensagem cifrada (usar encrypted_payload). '
  '''''' = mensagem soft-deletada. '
  'texto = mensagem legada (compatibilidade retroativa, leitura apenas).';
