-- =============================================================
-- Migration: 20260507000003_queue_client_confirmation.sql
-- Objetivo : Suporte à confirmação de presença do cliente
--            quando promovido para cadeira de produção (in_service).
--
-- Mudanças:
--   1. Adiciona client_confirmed em queue_entries para rastrear
--      se o cliente confirmou presença na cadeira.
--   2. Adiciona first_no_at para calcular o grace period de 5 min.
--   3. RPC confirmar_presenca_cliente — atualiza o estado da
--      entrada e, no segundo "Não", insere notificação para o
--      barbeiro (SECURITY DEFINER para contornar RLS).
--
-- Estados de client_confirmed:
--   NULL         — aguardando confirmação (novo ou pendente)
--   'yes'        — cliente confirmou presença → borda amarela
--   'no_waiting' — cliente disse "Não" uma vez → grace 5 min ativo
--   'absent'     — cliente não confirmou no grace → borda marrom
--                  barbeiro é notificado com type='client_absent'
-- =============================================================

-- ── 1. Novas colunas ─────────────────────────────────────────

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS client_confirmed TEXT
    CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent')),
  ADD COLUMN IF NOT EXISTS first_no_at TIMESTAMPTZ;

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estado de confirmação de presença do cliente na cadeira: yes | no_waiting | absent';

COMMENT ON COLUMN public.queue_entries.first_no_at IS
  'Timestamp do primeiro "Não" — base para cálculo do grace period de 5 min';

-- ── 2. RPC confirmar_presenca_cliente ────────────────────────

CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id   UUID,
  p_confirmado BOOLEAN,
  p_grace_used BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry   RECORD;
  v_profId  UUID;
BEGIN
  -- Busca a entrada e valida propriedade (client_id = chamador)
  SELECT qe.id, qe.professional_id, qe.barbershop_id,
         p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id        = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status    = 'in_service'
  LIMIT 1;

  -- Retorna silenciosamente se a entrada não pertence ao chamador
  -- ou não está em in_service (idempotente)
  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  v_profId := v_entry.professional_id;

  IF p_confirmado THEN
    -- Cliente confirmou presença
    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at      = NULL
    WHERE id = p_entry_id;

  ELSIF NOT p_grace_used THEN
    -- Primeiro "Não" — registra timestamp para o grace de 5 min
    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at      = NOW()
    WHERE id = p_entry_id;

  ELSE
    -- Segundo "Não" (grace expirado) — marca ausente e notifica barbeiro
    UPDATE public.queue_entries
    SET client_confirmed = 'absent'
    WHERE id = p_entry_id;

    -- Notifica o barbeiro responsável pela entrada
    IF v_profId IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
      ) VALUES (
        v_profId,
        'client_absent',
        'Cliente ausente 🔔',
        COALESCE(v_entry.client_name, 'Cliente') || ' não confirmou presença na cadeira.',
        jsonb_build_object(
          'client_absent',  true,
          'entry_id',       p_entry_id,
          'client_name',    COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',  v_entry.barbershop_id
        ),
        false,
        NOW()
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(UUID, BOOLEAN, BOOLEAN)
  TO authenticated;
