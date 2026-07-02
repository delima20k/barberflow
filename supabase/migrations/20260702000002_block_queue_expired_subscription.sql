-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260702000002_block_queue_expired_subscription
-- Objetivo : Impedir que clientes entrem na fila (sentem na cadeira)
--            quando o DONO da barbearia não tem assinatura ativa —
--            ou seja, quando o teste grátis (trial) expirou e ele não
--            pagou. Estende o trigger existente que já bloqueava fila
--            com a barbearia fechada (20260513000002).
--
--            Barreira no BANCO (última linha de defesa), independente
--            de front-end/back-end. Cobre a regra: "ao fim do dia 0,
--            barbearia fechada e ninguém pode sentar na cadeira".
--
--            SECURITY DEFINER: o cliente que insere na fila não pode
--            ler a tabela subscriptions (RLS restringe a auth.uid()).
--            A função roda como owner (postgres) e enxerga a assinatura
--            do dono. Sem assinatura trial/active não expirada => bloqueia.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_check_barbershop_open_on_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_open  BOOLEAN;
  v_owner_id UUID;
  v_ativa    BOOLEAN;
BEGIN
  SELECT is_open, owner_id
    INTO v_is_open, v_owner_id
    FROM public.barbershops
   WHERE id = NEW.barbershop_id;

  -- 1) Barbearia fechada (regra original)
  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Barbearia está fechada no momento.'
      USING ERRCODE = 'P0001', DETAIL = 'is_open = false';
  END IF;

  -- 2) Assinatura do dono precisa estar ativa (trial ou paga, não expirada)
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.user_id = v_owner_id
       AND s.status IN ('trial', 'active')
       AND s.ends_at > now()
  ) INTO v_ativa;

  IF NOT v_ativa THEN
    RAISE EXCEPTION 'Barbearia indisponível (assinatura inativa).'
      USING ERRCODE = 'P0001', DETAIL = 'owner subscription inactive/expired';
  END IF;

  RETURN NEW;
END;
$$;

-- O trigger trg_check_barbershop_open (20260513000002) já aponta para esta
-- função; o CREATE OR REPLACE acima basta. Recriamos por idempotência.
DROP TRIGGER IF EXISTS trg_check_barbershop_open ON public.queue_entries;
CREATE TRIGGER trg_check_barbershop_open
  BEFORE INSERT ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_barbershop_open_on_queue();
