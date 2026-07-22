-- Publica transacoes financeiras para atualizar o dashboard sem recarregar.
-- As politicas RLS existentes continuam limitando quais linhas cada usuario recebe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END
$$;
