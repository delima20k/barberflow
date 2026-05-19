-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260430000001_barbershop_close_reason
-- Objetivo : Adicionar coluna close_reason à tabela barbershops para
--            indicar o motivo do fechamento (almoco / janta / NULL).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS close_reason TEXT DEFAULT NULL;

-- Limpa close_reason sempre que a barbearia for reaberta
CREATE OR REPLACE FUNCTION public.fn_clear_close_reason()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_open = TRUE AND OLD.is_open = FALSE THEN
    NEW.close_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_close_reason ON public.barbershops;
CREATE TRIGGER trg_clear_close_reason
  BEFORE UPDATE ON public.barbershops
  FOR EACH ROW EXECUTE FUNCTION public.fn_clear_close_reason();
