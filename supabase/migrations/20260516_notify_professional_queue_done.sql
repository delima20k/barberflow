-- =============================================================
-- Migration : 20260516_notify_professional_queue_done.sql
-- Objetivo  : Notificar o PROFISSIONAL sobre o próximo cliente
--             quando um atendimento é finalizado (status → 'done').
--
-- Problema  : fn_notify_queue_clients notificava apenas clientes
--             em espera (loop por client_id); o profissional nunca
--             recebia informação sobre quem seria atendido a seguir.
--
-- Solução   : Após o loop existente (inalterado), realiza SELECT
--             do primeiro cliente em espera (inclui walk-ins sem
--             client_id) e insere notificação para NEW.professional_id:
--               • queue_next_client — há cliente aguardando
--               • queue_empty       — fila vazia após o atendimento
--
-- Walk-ins  : COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in')
--             garante nome significativo mesmo sem conta cadastrada.
--
-- Breaking  : Nenhum. CREATE OR REPLACE preserva o trigger existente
--             trg_notify_queue_on_done e o índice idx_queue_entries_*.
-- =============================================================

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           RECORD;
  posicao_rank  INT := 0;
  v_proximo     RECORD;
BEGIN
  -- Só executa quando status muda para 'done'
  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  -- ── 1. Notificar clientes cadastrados em espera (comportamento existente) ──
  FOR rec IN
    SELECT
      client_id,
      position,
      ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
    FROM public.queue_entries
    WHERE barbershop_id = NEW.barbershop_id
      AND status        = 'waiting'
      AND client_id     IS NOT NULL
  LOOP
    posicao_rank := rec.rank;
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
    VALUES (
      rec.client_id,
      'queue_update',
      'Fila avançou',
      CASE
        WHEN posicao_rank = 1 THEN 'Você é o próximo! Dirija-se à cadeira.'
        ELSE 'Você está na posição ' || posicao_rank || ' da fila.'
      END,
      jsonb_build_object(
        'position',      posicao_rank,
        'barbershop_id', NEW.barbershop_id,
        'is_next',       (posicao_rank = 1)
      ),
      false,
      NOW()
    );
  END LOOP;

  -- ── 2. Notificar profissional sobre o próximo cliente (novo comportamento) ──
  IF NEW.professional_id IS NOT NULL THEN
    -- Busca o primeiro em espera (inclui walk-ins) ordenado por posição
    SELECT
      qe.id                                                    AS entry_id,
      COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
    INTO v_proximo
    FROM public.queue_entries qe
    LEFT JOIN public.profiles p ON p.id = qe.client_id
    WHERE qe.barbershop_id = NEW.barbershop_id
      AND qe.status        = 'waiting'
    ORDER BY qe.position ASC
    LIMIT 1;

    IF v_proximo IS NOT NULL THEN
      -- Há próximo cliente → notifica o profissional
      INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES (
        NEW.professional_id,
        'queue_next_client',
        'Próximo cliente',
        v_proximo.client_name || ' está aguardando na fila.',
        jsonb_build_object(
          'entry_id',      v_proximo.entry_id,
          'client_name',   v_proximo.client_name,
          'barbershop_id', NEW.barbershop_id,
          'is_next',       true
        ),
        false,
        NOW()
      );
    ELSE
      -- Fila vazia → notifica profissional para que ele saiba
      INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES (
        NEW.professional_id,
        'queue_empty',
        'Fila vazia',
        'Não há mais clientes aguardando.',
        jsonb_build_object('barbershop_id', NEW.barbershop_id),
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
