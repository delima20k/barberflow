-- ==============================================================
-- Migration: 20260521000001_add_monthly_fee_mensalistas.sql
-- Descricao: Armazena o valor da mensalidade junto ao cliente ativo.
-- ==============================================================

ALTER TABLE public.barbershop_mensalistas
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'barbershop_mensalistas_monthly_fee_nonnegative'
  ) THEN
    ALTER TABLE public.barbershop_mensalistas
      ADD CONSTRAINT barbershop_mensalistas_monthly_fee_nonnegative
      CHECK (monthly_fee >= 0);
  END IF;
END $$;
