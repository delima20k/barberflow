-- ==============================================================
-- Migration: 20260521000002_add_haircuts_count_mensalistas.sql
-- Descrição: Adiciona contagem de cortes realizados no plano
--            mensal ativo de cada mensalista.
--
-- haircuts_count incrementa a cada corte executado e finalizado
-- pelo profissional para um cliente com Plano Mensal ativo.
-- ==============================================================

ALTER TABLE public.barbershop_mensalistas
  ADD COLUMN IF NOT EXISTS haircuts_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'barbershop_mensalistas_haircuts_count_nonnegative'
  ) THEN
    ALTER TABLE public.barbershop_mensalistas
      ADD CONSTRAINT barbershop_mensalistas_haircuts_count_nonnegative
      CHECK (haircuts_count >= 0);
  END IF;
END $$;
