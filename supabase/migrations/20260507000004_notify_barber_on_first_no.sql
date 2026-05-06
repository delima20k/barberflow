-- =============================================================
-- Migration: 20260507000004_notify_barber_on_first_no.sql
-- Objetivo : Notificar o barbeiro imediatamente quando o cliente
--            clica em "Não ainda" pela PRIMEIRA vez no modal de
--            confirmação de presença na cadeira.
--
-- Mudança:
--   Recria confirmar_presenca_cliente para inserir notificação
--   tipo 'client_not_seated' no primeiro "Não" (p_grace_used=false),
--   além da já existente 'client_absent' no segundo "Não".
-- =============================================================

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
    -- ── Cliente confirmou presença ──────────────────────────
    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at      = NULL
    WHERE id = p_entry_id;

  ELSIF NOT p_grace_used THEN
    -- ── Primeiro "Não" — registra timestamp para o grace ───
    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at      = NOW()
    WHERE id = p_entry_id;

    -- Notifica o barbeiro imediatamente (cliente avisou que ainda não está pronto)
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
        'client_not_seated',
        'Cliente ainda não está pronto',
        COALESCE(v_entry.client_name, 'Cliente') || ' avisou que ainda não está sentado na cadeira.',
        jsonb_build_object(
          'client_not_seated', true,
          'entry_id',          p_entry_id,
          'client_name',       COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',     v_entry.barbershop_id
        ),
        false,
        NOW()
      );
    END IF;

  ELSE
    -- ── Segundo "Não" (grace expirado) — marca ausente e notifica barbeiro ──
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
