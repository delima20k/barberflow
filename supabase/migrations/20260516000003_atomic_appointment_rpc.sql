-- ==============================================================
-- Migration: 20260516000003_atomic_appointment_rpc.sql
-- Descrição: Função RPC para criação atômica de agendamentos.
--
-- Problema resolvido (race condition):
--   AgendamentoBffService fazia SELECT (getConflitos) + INSERT (criar)
--   em duas operações separadas. Dois clientes simultâneos podiam
--   passar na verificação e criar double-booking.
--
-- Solução:
--   pg_advisory_xact_lock serializa chamadas pelo mesmo profissional.
--   A verificação de conflito e a inserção ocorrem na mesma transação,
--   eliminando a janela de race condition.
--
-- Retorno de erro:
--   P0001 + mensagem 'SCHEDULE_CONFLICT' → mapeado para 409 na BFF.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
  p_client_id       UUID,
  p_professional_id UUID,
  p_barbershop_id   UUID,
  p_service_id      UUID,
  p_scheduled_at    TIMESTAMPTZ,
  p_duration_min    INT,
  p_notes           TEXT    DEFAULT NULL,
  p_price_charged   NUMERIC DEFAULT NULL
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fim       TIMESTAMPTZ;
  v_conflito  INT;
BEGIN
  -- Lock exclusivo por profissional (advisory lock de transação).
  -- Serializa chamadas simultâneas para o MESMO profissional,
  -- sem bloquear agendamentos de profissionais diferentes.
  PERFORM pg_advisory_xact_lock(hashtext(p_professional_id::TEXT));

  v_fim := p_scheduled_at + (p_duration_min || ' minutes')::INTERVAL;

  -- Verifica sobreposição de horário com agendamentos ativos
  SELECT COUNT(*) INTO v_conflito
  FROM public.appointments
  WHERE professional_id = p_professional_id
    AND status NOT IN ('cancelled', 'no_show', 'done')
    AND scheduled_at < v_fim
    AND (scheduled_at + (duration_min || ' minutes')::INTERVAL) > p_scheduled_at;

  IF v_conflito > 0 THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Horário não disponível: conflito com agendamento existente.';
  END IF;

  -- Insere e retorna a linha criada
  RETURN QUERY
  INSERT INTO public.appointments (
    client_id, professional_id, barbershop_id, service_id,
    scheduled_at, duration_min, notes, price_charged, status
  )
  VALUES (
    p_client_id, p_professional_id, p_barbershop_id, p_service_id,
    p_scheduled_at, p_duration_min, p_notes, p_price_charged, 'pending'
  )
  RETURNING *;
END;
$$;

-- Apenas usuários autenticados podem criar agendamentos
REVOKE EXECUTE ON FUNCTION public.criar_agendamento_atomico(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_agendamento_atomico(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) TO authenticated;
