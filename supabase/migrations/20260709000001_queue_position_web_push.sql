-- =============================================================
-- Migration: 20260709000001_queue_position_web_push.sql
-- Objetivo:
--   Enviar Web Push real quando clientes waiting sobem de posicao na fila.
--
-- Operacao:
--   1. Configure a Edge Function send-push com:
--      QUEUE_POSITION_PUSH_INTERNAL_SECRET=<segredo-forte>
--   2. Configure o mesmo segredo no banco:
--      ALTER DATABASE postgres SET app.queue_position_push_secret = '<segredo-forte>';
--   3. Opcionalmente configure URL customizada:
--      ALTER DATABASE postgres SET app.queue_position_push_url =
--        'https://jfvjisqnzapxxagkbxcu.supabase.co/functions/v1/send-push';
--
-- rollback:
--   DROP TRIGGER IF EXISTS trg_notify_queue_clients ON public.queue_entries;
--   DROP FUNCTION IF EXISTS public._notify_queue_position_web_push(uuid, uuid, uuid, integer, integer);
--   -- Reaplicar fn_notify_queue_clients/trg_notify_queue_on_done da migration
--   -- 20260522000004 se precisar voltar exatamente ao comportamento anterior.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._notify_queue_position_web_push(
  p_client_id uuid,
  p_barbershop_id uuid,
  p_entry_id uuid,
  p_position integer,
  p_previous_position integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  v_secret text := current_setting('app.queue_position_push_secret', true);
  v_url text := COALESCE(
    NULLIF(current_setting('app.queue_position_push_url', true), ''),
    'https://jfvjisqnzapxxagkbxcu.supabase.co/functions/v1/send-push'
  );
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE WARNING 'queue position web push skipped: app.queue_position_push_secret not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-barberflow-internal-secret', v_secret
    ),
    body := jsonb_build_object(
      'clientId', p_client_id,
      'barbershopId', p_barbershop_id,
      'entradaId', p_entry_id,
      'appId', 'cliente',
      'pushType', 'queue_position_update',
      'position', p_position,
      'previousPosition', p_previous_position
    ),
    timeout_milliseconds := 1000
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING 'queue position web push skipped: pg_net/net.http_post unavailable';
  WHEN OTHERS THEN
    RAISE WARNING 'queue position web push request failed: %', SQLERRM;
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
      PERFORM public._insert_validated_notification(
        rec.client_id,
        v_professional_id,
        'queue_update',
        jsonb_build_object(
          'title', CASE
            WHEN rec.position = 1 THEN 'Voce e o proximo!'
            ELSE 'Voce subiu na fila!'
          END,
          'body', CASE
            WHEN rec.position = 1 THEN 'Agora voce esta em 1o lugar. Fique atento a chamada.'
            ELSE 'Agora voce esta em ' || rec.position || 'o lugar.'
          END,
          'data', jsonb_build_object(
            'position', rec.position,
            'previous_position', rec.previous_position,
            'entry_id', rec.entry_id,
            'barbershop_id', v_barbershop_id,
            'is_next', rec.position = 1,
            'push_type', 'queue_position_update'
          )
        ),
        'fn_notify_queue_clients',
        false
      );

      PERFORM public._notify_queue_position_web_push(
        rec.client_id,
        v_barbershop_id,
        rec.entry_id,
        rec.position,
        rec.previous_position
      );
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
      PERFORM public._insert_validated_notification(
        NEW.professional_id,
        NEW.professional_id,
        'queue_next_client',
        jsonb_build_object(
          'title', 'Proximo cliente',
          'body', v_proximo.client_name || ' esta aguardando na fila.',
          'data', jsonb_build_object(
            'entry_id', v_proximo.entry_id,
            'client_name', v_proximo.client_name,
            'barbershop_id', NEW.barbershop_id,
            'is_next', true
          )
        ),
        'fn_notify_queue_clients',
        false
      );
    ELSE
      PERFORM public._insert_validated_notification(
        NEW.professional_id,
        NEW.professional_id,
        'queue_empty',
        jsonb_build_object(
          'title', 'Fila vazia',
          'body', 'Nao ha mais clientes aguardando.',
          'data', jsonb_build_object('barbershop_id', NEW.barbershop_id)
        ),
        'fn_notify_queue_clients',
        false
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
