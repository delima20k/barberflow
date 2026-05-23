-- =============================================================================
-- Rollback de segurança — tabela public.notifications
--
-- ATENÇÃO: Cada step reverte para um estado menos seguro.
-- Usar somente em staging ou durante rollback de incidente aprovado.
-- Reabrir INSERT/DELETE direto restaura comportamento vulnerável.
--
-- STEP 1 — Reverte APENAS migration 20260523000001 (seguro)
--   Mantém todas as proteções de 20260522000004.
--   Restaura notificar_barbeiro_chegada para a versão de 20260522
--   (p_title/p_body aceitos do caller, mas sanitizados).
--
-- STEP 2 — Reverte TUDO até o estado legado (PERIGOSO)
--   Remove triggers, guard functions, SECURITY DEFINER functions,
--   audit trail e rate limits. Restaura INSERT/DELETE direto para
--   authenticated. Executar somente como último recurso.
-- =============================================================================

-- =============================================================================
-- STEP 1: Reverter somente 20260523000001
-- Execute este step se precisar apenas desfazer o V2/V3 fix.
-- Estado resultante: proteções de 20260522000004 intactas.
-- =============================================================================

BEGIN;

-- 1a. Remover tabela de rate limit global (criada em 20260523000001)
DROP TABLE IF EXISTS public.notification_sender_limits;

-- 1b. Restaurar _insert_validated_notification sem rate limit global
--     (versão exata de 20260522000004)
CREATE OR REPLACE FUNCTION public._insert_validated_notification(
  p_recipient_id     uuid,
  p_sender_id        uuid,
  p_type             text,
  p_payload          jsonb,
  p_source           text,
  p_apply_rate_limit boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_id uuid;
  v_type            public.notification_type;
  v_title           text;
  v_body            text;
  v_rate_count      integer;
BEGIN
  IF p_recipient_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM   public.profiles p
       WHERE  p.id = p_recipient_id
         AND  p.is_active = true
     ) THEN
    RAISE EXCEPTION 'notification_recipient_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.enumlabel::public.notification_type
  INTO   v_type
  FROM   pg_enum e
  JOIN   pg_type t  ON t.oid   = e.enumtypid
  JOIN   pg_namespace n ON n.oid  = t.typnamespace
  WHERE  n.nspname   = 'public'
    AND  t.typname   = 'notification_type'
    AND  e.enumlabel = p_type;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'notification_invalid_type'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 8192
     OR NOT (p_payload ? 'title')
     OR jsonb_typeof(p_payload->'title') <> 'string'
     OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160
     OR ((p_payload ? 'body') AND (
           jsonb_typeof(p_payload->'body') <> 'string'
           OR length(p_payload->>'body') > 1000
         ))
     OR ((p_payload ? 'data') AND jsonb_typeof(p_payload->'data') <> 'object')
     OR EXISTS (
          SELECT 1
          FROM   jsonb_object_keys(p_payload) AS k
          WHERE  k NOT IN ('title', 'body', 'data')
        ) THEN
    RAISE EXCEPTION 'notification_invalid_payload'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := btrim(p_payload->>'title');
  v_body  := COALESCE(p_payload->>'body', '');

  IF p_apply_rate_limit THEN
    IF p_sender_id IS NULL THEN
      RAISE EXCEPTION 'notification_sender_invalid'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text || ':' || p_recipient_id::text, 0)
    );

    INSERT INTO public.notification_rate_limits (
      sender_id, recipient_id, window_started_at, notification_count
    ) VALUES (
      p_sender_id, p_recipient_id, now(), 1
    )
    ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_rate_limits.window_started_at
             <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_rate_limits.window_started_at
      END,
      notification_count = CASE
        WHEN public.notification_rate_limits.window_started_at
             <= now() - interval '1 minute'
          THEN 1
        ELSE public.notification_rate_limits.notification_count + 1
      END
    RETURNING notification_count INTO v_rate_count;

    IF v_rate_count > 10 THEN
      RAISE EXCEPTION 'notification_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('app.notification_insert_allowed', 'on', true);

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, read_at, created_at
  ) VALUES (
    p_recipient_id, v_type::text, v_title, v_body,
    COALESCE(p_payload->'data', '{}'::jsonb),
    false, NULL, now()
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_audit (
    notification_id, actor_id, recipient_id, type, source
  ) VALUES (
    v_notification_id, p_sender_id, p_recipient_id, v_type,
    left(COALESCE(NULLIF(p_source, ''), 'unknown'), 80)
  );

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_validated_notification(
  uuid, uuid, text, jsonb, text, boolean
) FROM PUBLIC, anon, authenticated;

-- 1c. Restaurar notificar_barbeiro_chegada para versão de 20260522000004
--     (aceita p_title/p_body do caller, mas trunca e sanitiza)
--     ATENÇÃO: esta versão é vulnerável a V2/V4 (conteúdo attacker-controlled)
CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
  p_type            text,
  p_title           text,
  p_body            text,
  p_data            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  IF p_type NOT IN ('client_at_shop', 'client_arriving_late', 'client_not_seated')
     OR p_data IS NULL
     OR jsonb_typeof(p_data) <> 'object'
     OR COALESCE(p_data->>'entry_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'notification_queue_payload_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := (p_data->>'entry_id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM   public.queue_entries qe
    WHERE  qe.id              = v_entry_id
      AND  qe.client_id       = auth.uid()
      AND  qe.professional_id = p_professional_id
  ) THEN
    RAISE EXCEPTION 'notification_queue_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._insert_validated_notification(
    p_professional_id,
    auth.uid(),
    p_type,
    jsonb_build_object(
      'title', left(COALESCE(NULLIF(btrim(p_title), ''), 'Atualizacao da fila'), 160),
      'body',  left(COALESCE(p_body, ''), 1000),
      'data',  p_data
    ),
    'notificar_barbeiro_chegada',
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  TO authenticated;

COMMIT;

-- =============================================================================
-- STEP 2: Reverter TUDO ao estado legado (PERIGOSO — restaura vulnerabilidade)
-- Execute somente se precisar desfazer 20260522000004 E 20260523000001.
-- Estado resultante: INSERT/DELETE direto por authenticated (INSEGURO).
-- Reaplique o hardening o mais rápido possível após executar este step.
-- =============================================================================

/*  -- Descomente para executar o STEP 2

BEGIN;

DROP TRIGGER IF EXISTS trg_notifications_guard_insert      ON public.notifications;
DROP TRIGGER IF EXISTS trg_notifications_guard_user_update ON public.notifications;
DROP TRIGGER IF EXISTS trg_notifications_guard_user_delete ON public.notifications;
DROP FUNCTION IF EXISTS public.notifications_guard_insert();
DROP FUNCTION IF EXISTS public.notifications_guard_user_update();
DROP FUNCTION IF EXISTS public.notifications_guard_user_delete();

DROP FUNCTION IF EXISTS public.create_notification(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public._insert_validated_notification(uuid, uuid, text, jsonb, text, boolean);

DROP POLICY IF EXISTS "notifications_update_read_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own"      ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Legacy policy — vulnerável. Reaplique hardening ASAP.
CREATE POLICY "notifications_insert_own"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT DELETE ON public.notifications TO authenticated;

ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS read_at,
  DROP COLUMN IF EXISTS deleted_at;

DROP TABLE IF EXISTS public.notification_sender_limits;
DROP TABLE IF EXISTS public.notification_audit;
DROP TABLE IF EXISTS public.notification_rate_limits;
DROP TYPE  IF EXISTS public.notification_type;

COMMIT;

*/
