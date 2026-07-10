-- =============================================================
-- Migration: 20260710000001_queue_position_web_push_vault_config.sql
-- Objetivo:
--   Corrigir configuracao do Web Push de posicao na fila em Supabase
--   gerenciado, onde ALTER DATABASE ... SET app.* pode falhar por falta
--   de permissao de superusuario.
--
-- Operacao:
--   1. Configure a Edge Function send-push com:
--      QUEUE_POSITION_PUSH_INTERNAL_SECRET=<segredo-forte>
--   2. Configure o MESMO valor no Database Vault com name:
--      QUEUE_POSITION_PUSH_INTERNAL_SECRET
--   3. Opcionalmente configure a URL no Database Vault com name:
--      QUEUE_POSITION_PUSH_URL
--
-- rollback:
--   DROP FUNCTION IF EXISTS public._queue_position_push_setting(text, text, text);
--   -- Reaplicar public._notify_queue_position_web_push da migration
--   -- 20260709000001 se precisar voltar ao current_setting-only.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._queue_position_push_setting(
  p_vault_name text,
  p_guc_name text,
  p_default text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_value text;
BEGIN
  -- Compatibilidade com ambientes onde app.* ja esteja configurado.
  v_value := NULLIF(current_setting(p_guc_name, true), '');
  IF v_value IS NOT NULL THEN
    RETURN v_value;
  END IF;

  -- Caminho correto no Supabase gerenciado: Database Vault.
  BEGIN
    SELECT NULLIF(ds.decrypted_secret, '')
    INTO v_value
    FROM vault.decrypted_secrets ds
    WHERE ds.name = p_vault_name
    ORDER BY ds.updated_at DESC NULLS LAST, ds.created_at DESC NULLS LAST
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table OR insufficient_privilege THEN
      v_value := NULL;
  END;

  RETURN COALESCE(v_value, p_default);
END;
$$;

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
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE WARNING 'queue position web push skipped: QUEUE_POSITION_PUSH_INTERNAL_SECRET not configured in Database Vault';
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
