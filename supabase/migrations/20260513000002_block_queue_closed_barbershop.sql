-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260513000002_block_queue_closed_barbershop
-- Objetivo : Impedir inserção em queue_entries quando a barbearia
--            está fechada (is_open = false).
--            Garante a regra de negócio no banco como última barreira,
--            independente de qualquer validação no front-end ou back-end.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_check_barbershop_open_on_queue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_open BOOLEAN;
BEGIN
  SELECT is_open
    INTO v_is_open
    FROM public.barbershops
   WHERE id = NEW.barbershop_id;

  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Barbearia está fechada no momento.'
      USING ERRCODE = 'P0001', DETAIL = 'is_open = false';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_barbershop_open ON public.queue_entries;
CREATE TRIGGER trg_check_barbershop_open
  BEFORE INSERT ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_barbershop_open_on_queue();
