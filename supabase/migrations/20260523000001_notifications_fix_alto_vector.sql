-- =============================================================================
-- Migration: 20260523000001_notifications_fix_alto_vector.sql
-- Fecha V2/V4 (ALTO ativo): notificar_barbeiro_chegada ignora p_title/p_body do caller.
-- Fecha V3 (MÉDIO ativo): rate limit global por sender (max 50/min).
-- Belt-and-suspenders: garante que nenhuma INSERT policy permissiva sobrou.
-- Reversível: docs/db/notifications-fix-rollback.sql § STEP-1 (seguro)
-- =============================================================================

BEGIN;

-- ─── 1. Garantir ausência de INSERT policies permissivas ─────────────────────
-- As policies corretas foram removidas em 20260522000004.
-- Este DROP é defensivo: protege contra rollback parcial ou migration out-of-order.
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own"     ON public.notifications;

-- ─── 2. Tabela de rate limit global por sender ───────────────────────────────
-- Complementa notification_rate_limits (por par sender+recipient).
-- Limite: 50 notificações / min por sender, independente do recipient.
CREATE TABLE IF NOT EXISTS public.notification_sender_limits (
  sender_id         uuid        NOT NULL
                    REFERENCES  public.profiles(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  sent_count        integer     NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  PRIMARY KEY (sender_id)
);

ALTER TABLE public.notification_sender_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_sender_limits FROM anon, authenticated;

-- ─── 3. _insert_validated_notification — adiciona rate limit global ──────────
-- Único ponto de INSERT seguro. Substituição completa necessária (PL/pgSQL).
-- Mudanças vs 20260522000004:
--   • Bloco de rate limit global (notification_sender_limits, 50/min)
--   • Lock global adquirido ANTES do lock por par (ordem determinística)
--   • Variável v_pair_count renomeada para clareza
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
  v_pair_count      integer;
  v_global_count    integer;
BEGIN
  -- ── Validar recipient ──────────────────────────────────────────────────────
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

  -- ── Validar type via pg_enum (sem texto livre do cliente) ──────────────────
  SELECT e.enumlabel::public.notification_type
  INTO   v_type
  FROM   pg_enum     e
  JOIN   pg_type     t ON t.oid   = e.enumtypid
  JOIN   pg_namespace n ON n.oid  = t.typnamespace
  WHERE  n.nspname   = 'public'
    AND  t.typname   = 'notification_type'
    AND  e.enumlabel = p_type;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'notification_invalid_type'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Validar schema do payload ──────────────────────────────────────────────
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

  -- ── Rate limits (apenas quando solicitado — triggers de sistema usam false) ─
  IF p_apply_rate_limit THEN
    IF p_sender_id IS NULL THEN
      RAISE EXCEPTION 'notification_sender_invalid'
        USING ERRCODE = 'P0001';
    END IF;

    -- Lock global adquirido ANTES do lock por par para manter ordem determinística
    -- e evitar deadlock entre transações concorrentes do mesmo sender.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text, 1)
    );

    INSERT INTO public.notification_sender_limits (sender_id, window_started_at, sent_count)
    VALUES (p_sender_id, now(), 1)
    ON CONFLICT (sender_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_sender_limits.window_started_at
             <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_sender_limits.window_started_at
      END,
      sent_count = CASE
        WHEN public.notification_sender_limits.window_started_at
             <= now() - interval '1 minute'
          THEN 1
        ELSE public.notification_sender_limits.sent_count + 1
      END
    RETURNING sent_count INTO v_global_count;

    IF v_global_count > 50 THEN
      RAISE EXCEPTION 'notification_global_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;

    -- Lock por par adquirido após lock global
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
    RETURNING notification_count INTO v_pair_count;

    IF v_pair_count > 10 THEN
      RAISE EXCEPTION 'notification_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── Autorizar INSERT via guard trigger (transaction-local) ─────────────────
  PERFORM set_config('app.notification_insert_allowed', 'on', true);

  -- ── INSERT ─────────────────────────────────────────────────────────────────
  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, read_at, created_at
  ) VALUES (
    p_recipient_id,
    v_type::text,
    v_title,
    v_body,
    COALESCE(p_payload->'data', '{}'::jsonb),
    false,
    NULL,
    now()
  )
  RETURNING id INTO v_notification_id;

  -- ── Auditoria ──────────────────────────────────────────────────────────────
  INSERT INTO public.notification_audit (
    notification_id, actor_id, recipient_id, type, source
  ) VALUES (
    v_notification_id,
    p_sender_id,
    p_recipient_id,
    v_type,
    left(COALESCE(NULLIF(p_source, ''), 'unknown'), 80)
  );

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_validated_notification(
  uuid, uuid, text, jsonb, text, boolean
) FROM PUBLIC, anon, authenticated;

-- ─── 4. notificar_barbeiro_chegada — fecha V2/V4 (ALTO) ──────────────────────
-- p_title e p_body são mantidos na assinatura para compatibilidade com os callers
-- FilaPresencaService.js e ChegadaProducaoService.js, mas são completamente
-- IGNORADOS. Título e corpo são derivados de p_type + nome do cliente no banco.
CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
  p_type            text,
  p_title           text,   -- mantido para compatibilidade; IGNORADO
  p_body            text,   -- mantido para compatibilidade; IGNORADO
  p_data            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id    uuid;
  v_client_name text;
  v_title       text;
  v_body        text;
BEGIN
  -- ── Validar type e estrutura de p_data ────────────────────────────────────
  IF p_type NOT IN ('client_at_shop', 'client_arriving_late', 'client_not_seated')
     OR p_data IS NULL
     OR jsonb_typeof(p_data) <> 'object'
     OR COALESCE(p_data->>'entry_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'notification_queue_payload_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := (p_data->>'entry_id')::uuid;

  -- ── Buscar nome do cliente do banco — NÃO do caller ───────────────────────
  SELECT COALESCE(p.full_name, 'Cliente')
  INTO   v_client_name
  FROM   public.queue_entries  qe
  LEFT JOIN public.profiles    p  ON p.id = qe.client_id
  WHERE  qe.id              = v_entry_id
    AND  qe.client_id       = auth.uid()
    AND  qe.professional_id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_queue_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Título e corpo fixos por type — p_title/p_body do caller são IGNORADOS ─
  v_title := CASE p_type
    WHEN 'client_at_shop'       THEN 'Cliente na barbearia'
    WHEN 'client_arriving_late' THEN 'Cliente a caminho'
    WHEN 'client_not_seated'    THEN 'Cliente ainda nao esta pronto'
  END;

  v_body := CASE p_type
    WHEN 'client_at_shop'       THEN v_client_name || ' confirmou que esta na barbearia.'
    WHEN 'client_arriving_late' THEN v_client_name || ' ainda nao chegou. Aguardando...'
    WHEN 'client_not_seated'    THEN v_client_name || ' avisou que ainda nao esta sentado.'
  END;

  PERFORM public._insert_validated_notification(
    p_professional_id,
    auth.uid(),
    p_type,
    jsonb_build_object('title', v_title, 'body', v_body, 'data', p_data),
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
