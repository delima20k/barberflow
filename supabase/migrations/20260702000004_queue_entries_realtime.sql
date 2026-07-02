-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260702000004_queue_entries_realtime
-- Objetivo : Publicar a tabela queue_entries no Realtime do Supabase.
--
--            Bug: quando o cliente senta na cadeira (INSERT em
--            queue_entries), o profissional NÃO recebe o evento em tempo
--            real — porque a tabela nunca foi adicionada à publicação
--            `supabase_realtime`. Os canais do profissional
--            (#iniciarRealtimeFila e QueueRealtimeClient) assinam
--            postgres_changes em queue_entries, mas sem a publicação o
--            Postgres não emite nada.
--
--            A RLS já permite leitura pública da fila (queue_select_public
--            = for select using(true)), então basta publicar.
--
--            REPLICA IDENTITY FULL: garante que UPDATE/DELETE também
--            entreguem barbershop_id para o filtro do canal
--            (filter: barbershop_id=eq.X). INSERT já funciona só com a
--            publicação.
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname   = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'queue_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
  END IF;
END $$;

ALTER TABLE public.queue_entries REPLICA IDENTITY FULL;
