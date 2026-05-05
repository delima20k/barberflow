-- =============================================================
-- Migration: 20260505000005_notify_all_queue_on_done.sql
-- Objetivo : Notificar TODOS os clientes em espera na fila
--            quando um atendimento é finalizado (status → 'done').
--
-- Por que SECURITY DEFINER?
--   A tabela notifications tem RLS que limita INSERT ao próprio
--   user_id (auth.uid()). Aqui quem insere é o trigger (sem
--   sessão de usuário), então precisamos executar como postgres
--   para contornar o RLS de forma controlada e auditável.
--
-- Comportamento:
--   1. Após UPDATE de status para 'done' em queue_entries,
--      busca todas as entradas com status='waiting' no mesmo
--      barbershop_id que possuam client_id (usuários cadastrados).
--   2. Insere uma notification para cada cliente informando
--      sua nova posição na fila, em ordem crescente de position.
--   3. O campo data->>'position' é usado pelo QueuePoller.js
--      para detectar mudanças sem precisar re-fetch completo.
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
BEGIN
  -- Só executa quando status muda para 'done'
  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  -- Para cada cliente em espera nesta barbearia, em ordem de fila
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

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      body,
      data,
      is_read,
      created_at
    ) VALUES (
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

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se já existir (idempotente)
DROP TRIGGER IF EXISTS trg_notify_queue_on_done ON public.queue_entries;

CREATE TRIGGER trg_notify_queue_on_done
  AFTER UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_queue_clients();

-- Índice auxiliar para a query do trigger (busca por barbershop + status + client_id)
CREATE INDEX IF NOT EXISTS idx_queue_entries_shop_waiting
  ON public.queue_entries (barbershop_id, status, position)
  WHERE status = 'waiting';
