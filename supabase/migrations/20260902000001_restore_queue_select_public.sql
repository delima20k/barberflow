-- ================================================================
-- Migration: 20260902000001_restore_queue_select_public.sql
-- Restaura leitura pública (incluindo anon) de queue_entries.
--
-- CONTEXTO — como essa divergência aconteceu:
--   O schema original (20260406000003_rls_policies.sql) criou
--   "queue_select_public" com USING (true), comentado como
--   "público = estratégia de negócio".
--
--   Em 05/05, uma auditoria de segurança (commit eb5354aa,
--   migration 20260505000004_security_hardening_v2.sql — GAP 2)
--   substituiu essa policy por "queue_select_authenticated"
--   (USING (auth.role() = 'authenticated')), para impedir que
--   visitantes anônimos lessem guest_name/client_id da fila via
--   chamada direta à API REST (não só pelo app).
--
--   Esse arquivo de migration foi perdido do repositório em algum
--   momento posterior (não existe mais em supabase/migrations/,
--   confirmado por git log -S), mas seu efeito continua ativo em
--   produção — confirmado ao vivo via `select * from pg_policies
--   where tablename = 'queue_entries'` em 02/09. Ou seja: os
--   arquivos de migration atuais não refletem mais o estado real
--   do banco para essa tabela.
--
-- DECISÃO (dono do produto, 02/09):
--   Reverter para leitura pública, restaurando o design original —
--   visitante sem login precisa ver quem ocupa cada cadeira
--   (nome de quem está em atendimento/espera) na página pública
--   da barbearia. Trade-off aceito conscientemente: guest_name e
--   client_id da fila voltam a ser legíveis por qualquer chamada
--   direta à API (não só pela tela do app), sem exigir login —
--   mesmo nível de exposição que existia antes de 05/05, hoje
--   aceito como parte do modelo de negócio (fila pública, como o
--   quadro de uma barbearia física).
--
--   queue_insert_own e queue_write_professional (escrita) NÃO são
--   alteradas por esta migration.
-- ================================================================

DROP POLICY IF EXISTS "queue_select_authenticated" ON public.queue_entries;

CREATE POLICY "queue_select_public"
  ON public.queue_entries FOR SELECT
  USING (true);

-- rollback:
-- DROP POLICY IF EXISTS "queue_select_public" ON public.queue_entries;
-- CREATE POLICY "queue_select_authenticated" ON public.queue_entries FOR SELECT USING (auth.role() = 'authenticated');
