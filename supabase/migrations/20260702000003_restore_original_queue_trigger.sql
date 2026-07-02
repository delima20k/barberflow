-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260702000003_restore_original_queue_trigger
-- Objetivo : Reverter o check de assinatura que havia sido adicionado ao
--            trigger de fila (20260702000002). Decisão de produto: basta
--            FECHAR a barbearia (is_open=false) quando a assinatura do dono
--            expira — o bloqueio de "barbearia fechada => ninguém senta" já
--            existe (20260513000002). O fechamento é feito pelo BFF em
--            ProfessionalPaymentService.buscarStatusAssinatura.
--
--            Esta migration restaura a função original (só checa is_open),
--            garantindo consistência mesmo que 20260702000002 tenha sido
--            aplicada manualmente. Idempotente.
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
