-- =============================================================================
-- Migration: 20260811000004_fn_notify_queue_clients_personalized_text.sql
-- Objetivo:
--   Replicar na notificacao in-app (tabela notifications) o mesmo texto
--   personalizado com nome e as mesmas 3 faixas de posicao ja aplicadas no
--   Web Push (send-push/index.ts, migration/deploy anteriores desta feature),
--   para manter consistencia entre o que aparece no app aberto (in-app,
--   via Realtime) e o que chega como push (app fechado).
--
-- Operacao:
--   CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients() -- identica a
--   versao ativa (migration 20260811000001_fix_queue_position_web_push_bigint_cast.sql),
--   exceto por: dentro do LOOP, busca v_client_name (profiles.full_name) por
--   rec.client_id, monta v_saudacao ("Ola {nome}" ou "Ola" generico), e troca
--   o CASE de title/body de 2 ramos (1o / resto) para 3 ramos (1o / 2o /
--   intermediarias), com o mesmo texto usado na Edge Function. Tambem inclui
--   'client_name' no jsonb de data, para eventual uso futuro sem novo join.
--
-- rollback:
--   Reaplicar a migration 20260811000001_fix_queue_position_web_push_bigint_cast.sql
--   (CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients() com o texto
--   original de 2 faixas, sem nome).
-- =============================================================================

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
  v_client_name text;
  v_saudacao text;
  v_title text;
  v_body text;
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
      SELECT p.full_name INTO v_client_name
      FROM public.profiles p
      WHERE p.id = rec.client_id;

      v_saudacao := CASE
        WHEN NULLIF(btrim(v_client_name), '') IS NOT NULL THEN 'Ola ' || btrim(v_client_name)
        ELSE 'Ola'
      END;

      IF rec.position = 1 THEN
        v_title := 'Voce e o proximo!';
        v_body  := v_saudacao || ', voce ja e o proximo! Dirija-se ate a barbearia.';
      ELSIF rec.position = 2 THEN
        v_title := 'Prepare-se!';
        v_body  := v_saudacao || ', fique ligado, voce sera o proximo a ser chamado para o corte.';
      ELSE
        v_title := 'Voce subiu na fila!';
        v_body  := v_saudacao || ', voce esta em ' || rec.position || 'o lugar, fique atento.';
      END IF;

      PERFORM public._queue_trigger_insert_notification(
        rec.client_id,
        'queue_update',
        v_title,
        v_body,
        jsonb_build_object(
          'position', rec.position,
          'previous_position', rec.previous_position,
          'entry_id', rec.entry_id,
          'barbershop_id', v_barbershop_id,
          'is_next', rec.position = 1,
          'push_type', 'queue_position_update',
          'client_name', v_client_name
        )
      );

      BEGIN
        PERFORM public._notify_queue_position_web_push(
          rec.client_id,
          v_barbershop_id,
          rec.entry_id,
          rec.position::integer,
          rec.previous_position::integer
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
