-- =============================================================================
-- Migration: 20260811000001_fix_queue_position_web_push_bigint_cast.sql
-- Objetivo:
--   Corrigir fn_notify_queue_clients() para nao quebrar a chamada de Web Push
--   de posicao na fila com "undefined_function".
--
-- Contexto:
--   rec.position e rec.previous_position vem de ROW_NUMBER() OVER (...), que
--   sempre retorna bigint. public._notify_queue_position_web_push(...) espera
--   p_position/p_previous_position como integer. bigint -> integer so tem cast
--   de atribuicao (pg_cast.castcontext = 'a'), nao implicito -- por isso o
--   Postgres nao encontra a funcao na resolucao de overload da chamada e
--   levanta 42883 (undefined_function), sempre, em qualquer sessao/conexao.
--   Isso era capturado pelo bloco "WHEN undefined_function" ja existente em
--   fn_notify_queue_clients() e silenciado como:
--     RAISE WARNING 'queue position web push skipped: _notify_queue_position_web_push unavailable';
--   fazendo o push de mudanca de posicao nunca sair, mesmo com segredo/pg_net
--   configurados corretamente (a notificacao in-app continuava funcionando
--   normalmente, pois nao depende dessa chamada).
--
-- Operacao:
--   CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients() -- identica a
--   versao da migration 20260710000002_queue_clients_trigger_safe_notifications.sql,
--   exceto por rec.position::integer / rec.previous_position::integer na
--   chamada a public._notify_queue_position_web_push(...). Como e um
--   CREATE OR REPLACE sobre a mesma assinatura, o trigger existente
--   (trg_notify_queue_clients) continua valido sem precisar ser recriado.
--
-- rollback:
--   Reaplicar a migration 20260710000002_queue_clients_trigger_safe_notifications.sql
--   (CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients() com o corpo
--   original, sem os casts).
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
