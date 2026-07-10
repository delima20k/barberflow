-- =============================================================================
-- Migration: 20260710000002_queue_clients_trigger_safe_notifications.sql
-- Objetivo:
--   Corrigir fn_notify_queue_clients para nao depender da funcao ausente
--   public._insert_validated_notification em bancos de producao que nunca
--   aplicaram o hardening antigo de notifications.
--
-- Contexto:
--   Em producao, trg_notify_queue_clients quebrou finalizacao de corte/pagamento
--   com:
--     function public._insert_validated_notification(...) does not exist
--
-- Estrategia:
--   - Criar helper propria e defensiva para notificacoes de fila.
--   - Inserir apenas nas colunas reais e antigas de public.notifications.
--   - Converter falhas de notificacao em WARNING, nunca em rollback da venda.
--   - Manter o Web Push de posicao via _notify_queue_position_web_push.
--
-- IMPORTANTE:
--   Apos o incidente, aplique primeiro em staging. So reaplique o trigger em
--   producao depois de validar finalizar corte, pagamento, avanco de fila e push.
--
-- rollback:
--   DROP TRIGGER IF EXISTS trg_notify_queue_clients ON public.queue_entries;
--   DROP FUNCTION IF EXISTS public._queue_trigger_insert_notification(uuid, text, text, text, jsonb);
-- =============================================================================

CREATE OR REPLACE FUNCTION public._queue_trigger_insert_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_recipient_id
      AND COALESCE(p.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.notification_insert_allowed', 'on', true);

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    is_read,
    created_at
  ) VALUES (
    p_recipient_id,
    p_type,
    left(COALESCE(NULLIF(btrim(p_title), ''), 'Atualizacao da fila'), 160),
    left(COALESCE(p_body, ''), 1000),
    COALESCE(p_data, '{}'::jsonb),
    false,
    now()
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'queue trigger notification skipped: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
  v_barbershop_id uuid;
  v_professional_id uuid;
  v_proximo record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_barbershop_id := OLD.barbershop_id;
    v_professional_id := OLD.professional_id;
  ELSE
    v_barbershop_id := NEW.barbershop_id;
    v_professional_id := NEW.professional_id;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'waiting' THEN
    FOR rec IN
      WITH previous_waiting AS (
        SELECT qe.id, qe.client_id, qe.position
        FROM public.queue_entries qe
        WHERE qe.barbershop_id = v_barbershop_id
          AND qe.status = 'waiting'
          AND qe.id <> OLD.id
        UNION ALL
        SELECT OLD.id, OLD.client_id, OLD.position
      ),
      current_waiting AS (
        SELECT qe.id, qe.client_id, qe.position
        FROM public.queue_entries qe
        WHERE qe.barbershop_id = v_barbershop_id
          AND qe.status = 'waiting'
      ),
      previous_ranked AS (
        SELECT
          id,
          client_id,
          ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) AS previous_position
        FROM previous_waiting
      ),
      current_ranked AS (
        SELECT
          id,
          client_id,
          ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) AS position
        FROM current_waiting
      )
      SELECT
        c.id AS entry_id,
        c.client_id,
        c.position,
        p.previous_position
      FROM current_ranked c
      JOIN previous_ranked p
        ON p.id = c.id
       AND p.client_id IS NOT DISTINCT FROM c.client_id
      WHERE c.client_id IS NOT NULL
        AND c.position <> p.previous_position
      ORDER BY c.position ASC
    LOOP
      PERFORM public._queue_trigger_insert_notification(
        rec.client_id,
        'queue_update',
        CASE
          WHEN rec.position = 1 THEN 'Voce e o proximo!'
          ELSE 'Voce subiu na fila!'
        END,
        CASE
          WHEN rec.position = 1 THEN 'Agora voce esta em 1o lugar. Fique atento a chamada.'
          ELSE 'Agora voce esta em ' || rec.position || 'o lugar.'
        END,
        jsonb_build_object(
          'position', rec.position,
          'previous_position', rec.previous_position,
          'entry_id', rec.entry_id,
          'barbershop_id', v_barbershop_id,
          'is_next', rec.position = 1,
          'push_type', 'queue_position_update'
        )
      );

      BEGIN
        PERFORM public._notify_queue_position_web_push(
          rec.client_id,
          v_barbershop_id,
          rec.entry_id,
          rec.position,
          rec.previous_position
        );
      EXCEPTION
        WHEN undefined_function THEN
          RAISE WARNING 'queue position web push skipped: _notify_queue_position_web_push unavailable';
        WHEN OTHERS THEN
          RAISE WARNING 'queue position web push skipped: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'done' AND NEW.professional_id IS NOT NULL THEN
    SELECT qe.id AS entry_id, COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
    INTO v_proximo
    FROM public.queue_entries qe
    LEFT JOIN public.profiles p ON p.id = qe.client_id
    WHERE qe.barbershop_id = NEW.barbershop_id
      AND qe.status = 'waiting'
    ORDER BY qe.position ASC, qe.id ASC
    LIMIT 1;

    IF v_proximo IS NOT NULL THEN
      PERFORM public._queue_trigger_insert_notification(
        NEW.professional_id,
        'queue_next_client',
        'Proximo cliente',
        v_proximo.client_name || ' esta aguardando na fila.',
        jsonb_build_object(
          'entry_id', v_proximo.entry_id,
          'client_name', v_proximo.client_name,
          'barbershop_id', NEW.barbershop_id,
          'is_next', true
        )
      );
    ELSE
      PERFORM public._queue_trigger_insert_notification(
        NEW.professional_id,
        'queue_empty',
        'Fila vazia',
        'Nao ha mais clientes aguardando.',
        jsonb_build_object(
          'barbershop_id', NEW.barbershop_id
        )
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_queue_on_done ON public.queue_entries;
DROP TRIGGER IF EXISTS trg_notify_queue_clients ON public.queue_entries;

CREATE TRIGGER trg_notify_queue_clients
AFTER UPDATE OR DELETE ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_queue_clients();
