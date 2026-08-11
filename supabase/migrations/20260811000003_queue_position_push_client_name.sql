-- =============================================================================
-- Migration: 20260811000003_queue_position_push_client_name.sql
-- Objetivo:
--   Incluir o nome do cliente (profiles.full_name) no payload do Web Push de
--   mudanca de posicao na fila, para permitir mensagens personalizadas
--   ("Ola Joao, voce esta em 3o lugar...") na Edge Function send-push.
--
-- Operacao:
--   CREATE OR REPLACE FUNCTION public._notify_queue_position_web_push(...) --
--   identica a versao ativa (migration 20260710000001_queue_position_web_push_vault_config.sql),
--   exceto por: busca v_client_name via SELECT ... FROM public.profiles WHERE
--   id = p_client_id, e inclui 'clientName' no jsonb_build_object do body.
--   SELECT INTO sem match deixa v_client_name NULL (sem excecao) -- a Edge
--   Function trata ausencia de nome com fallback generico.
--
-- rollback:
--   Reaplicar a migration 20260710000001_queue_position_web_push_vault_config.sql
--   (CREATE OR REPLACE FUNCTION public._notify_queue_position_web_push(...) sem
--   a busca de nome e sem 'clientName' no payload).
-- =============================================================================

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
  v_secret text := public._queue_position_push_setting(
    'QUEUE_POSITION_PUSH_INTERNAL_SECRET',
    'app.queue_position_push_secret',
    NULL
  );
  v_url text := public._queue_position_push_setting(
    'QUEUE_POSITION_PUSH_URL',
    'app.queue_position_push_url',
    'https://jfvjisqnzapxxagkbxcu.supabase.co/functions/v1/send-push'
  );
  v_client_name text;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE WARNING 'queue position web push skipped: QUEUE_POSITION_PUSH_INTERNAL_SECRET not configured in Database Vault';
    RETURN;
  END IF;

  SELECT p.full_name INTO v_client_name
  FROM public.profiles p
  WHERE p.id = p_client_id;

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
      'previousPosition', p_previous_position,
      'clientName', v_client_name
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
