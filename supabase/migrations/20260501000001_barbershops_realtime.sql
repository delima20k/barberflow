-- ============================================================
-- Habilita Supabase Realtime para a tabela barbershops
--
-- Permite que clientes subscrevam mudanças de status
-- (is_open, close_reason) em tempo real via postgres_changes.
-- A tabela já possui RLS com SELECT público (anon), portanto
-- não são necessárias políticas adicionais.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE barbershops;
