-- Migration: 20260517000004_barbershops_missing_columns
-- Objetivo : Garantir idempotentemente que colunas adicionadas por migrations
--            anteriores (Abril) existam no projeto Supabase atual.
--            Seguro de rodar mesmo que as colunas já existam (IF NOT EXISTS).

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS likes_count     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count  INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score    NUMERIC(3,1)  NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS font_key        TEXT,
  ADD COLUMN IF NOT EXISTS close_reason    TEXT;

-- Garante policy de leitura pública para a role anon
-- (necessário para o fallback frontend via anon_key funcionar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'barbershops'
      AND policyname = 'anon_select_active_barbershops'
  ) THEN
    CREATE POLICY "anon_select_active_barbershops"
      ON public.barbershops
      FOR SELECT
      TO anon
      USING (is_active = TRUE);
  END IF;
END $$;
