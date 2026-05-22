-- Security hardening for legacy public.notifications.
-- Direct authenticated INSERT/DELETE is forbidden. Notifications enter through
-- SECURITY DEFINER functions that validate recipient, type, payload and rate.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.notifications
SET read_at = COALESCE(read_at, created_at)
WHERE is_read = true
  AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_visible
  ON public.notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'sistema',
    'agendamento',
    'barbearia',
    'engajamento',
    'appointment_confirmed',
    'new_message',
    'queue_update',
    'client_at_shop',
    'client_arriving_late',
    'client_not_seated',
    'client_absent',
    'queue_next_client',
    'queue_empty'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'sistema';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agendamento';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'barbearia';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'engajamento';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_confirmed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_message';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_at_shop';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_arriving_late';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_not_seated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_absent';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_next_client';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_empty';

CREATE TABLE IF NOT EXISTS public.notification_rate_limits (
  sender_id          uuid not null references public.profiles(id) on delete cascade,
  recipient_id       uuid not null references public.profiles(id) on delete cascade,
  window_started_at  timestamptz not null default now(),
  notification_count integer not null default 0 check (notification_count >= 0),
  primary key (sender_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS public.notification_audit (
  id              uuid primary key default uuid_generate_v4(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  type            public.notification_type not null,
  source          text not null,
  created_at      timestamptz not null default now()
);

ALTER TABLE public.notification_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_rate_limits_no_client_access" ON public.notification_rate_limits;
DROP POLICY IF EXISTS "notification_audit_no_client_access" ON public.notification_audit;

REVOKE ALL ON public.notification_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.notification_audit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notifications_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.notification_insert_allowed', true) = 'on'
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'notification_direct_insert_forbidden'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_insert ON public.notifications;
CREATE TRIGGER trg_notifications_guard_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_insert();

CREATE OR REPLACE FUNCTION public.notifications_guard_user_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_read IS DISTINCT FROM OLD.is_read
     OR (to_jsonb(NEW) - 'read_at' - 'deleted_at' - 'is_read')
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'read_at' - 'deleted_at' - 'is_read') THEN
    RAISE EXCEPTION 'notification_update_fields_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.read_at IS NOT NULL
     AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'notification_read_at_immutable'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'notification_deleted_at_immutable'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.is_read := NEW.read_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_user_update ON public.notifications;
CREATE TRIGGER trg_notifications_guard_user_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_user_update();

CREATE OR REPLACE FUNCTION public.notifications_guard_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'notification_delete_forbidden_use_deleted_at'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_user_delete ON public.notifications;
CREATE TRIGGER trg_notifications_guard_user_delete
  BEFORE DELETE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_user_delete();

DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_read_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

CREATE POLICY "notifications_update_read_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = user_id);

REVOKE DELETE ON public.notifications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._insert_validated_notification(
  p_recipient_id uuid,
  p_sender_id uuid,
  p_type text,
  p_payload jsonb,
  p_source text,
  p_apply_rate_limit boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_id uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_rate_count integer;
BEGIN
  IF p_recipient_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = p_recipient_id
         AND p.is_active = true
     ) THEN
    RAISE EXCEPTION 'notification_recipient_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.enumlabel::public.notification_type
  INTO v_type
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'notification_type'
    AND e.enumlabel = p_type;

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
       FROM jsonb_object_keys(p_payload) AS payload_key
       WHERE payload_key NOT IN ('title', 'body', 'data')
     ) THEN
    RAISE EXCEPTION 'notification_invalid_payload'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := btrim(p_payload->>'title');
  v_body := COALESCE(p_payload->>'body', '');

  IF p_apply_rate_limit THEN
    IF p_sender_id IS NULL THEN
      RAISE EXCEPTION 'notification_sender_invalid'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text || ':' || p_recipient_id::text, 0)
    );

    INSERT INTO public.notification_rate_limits (
      sender_id,
      recipient_id,
      window_started_at,
      notification_count
    ) VALUES (
      p_sender_id,
      p_recipient_id,
      now(),
      1
    )
    ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_rate_limits.window_started_at <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_rate_limits.window_started_at
      END,
      notification_count = CASE
        WHEN public.notification_rate_limits.window_started_at <= now() - interval '1 minute'
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
    user_id,
    type,
    title,
    body,
    data,
    is_read,
    read_at,
    created_at
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

  INSERT INTO public.notification_audit (
    notification_id,
    actor_id,
    recipient_id,
    type,
    source
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

CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_type text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN public._insert_validated_notification(
      p_recipient_id,
      NULL,
      p_type,
      p_payload,
      'create_notification_service',
      false
    );
  END IF;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'notification_auth_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recipient_id IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'notification_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN public._insert_validated_notification(
    p_recipient_id,
    v_sender_id,
    p_type,
    p_payload,
    'create_notification',
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
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
    FROM public.queue_entries qe
    WHERE qe.id = v_entry_id
      AND qe.client_id = auth.uid()
      AND qe.professional_id = p_professional_id
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
      'body', left(COALESCE(p_body, ''), 1000),
      'data', p_data
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

CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id uuid,
  p_confirmado boolean,
  p_grace_used boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry record;
BEGIN
  SELECT qe.id, qe.professional_id, qe.barbershop_id, p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status = 'in_service'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  IF p_confirmado THEN
    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at = NULL
    WHERE id = p_entry_id;
    RETURN;
  END IF;

  IF NOT p_grace_used THEN
    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at = now()
    WHERE id = p_entry_id;

    IF v_entry.professional_id IS NOT NULL THEN
      PERFORM public._insert_validated_notification(
        v_entry.professional_id,
        auth.uid(),
        'client_not_seated',
        jsonb_build_object(
          'title', 'Cliente ainda nao esta pronto',
          'body', COALESCE(v_entry.client_name, 'Cliente') || ' avisou que ainda nao esta sentado na cadeira.',
          'data', jsonb_build_object(
            'client_not_seated', true,
            'entry_id', p_entry_id,
            'client_name', COALESCE(v_entry.client_name, 'Cliente'),
            'barbershop_id', v_entry.barbershop_id
          )
        ),
        'confirmar_presenca_cliente',
        true
      );
    END IF;
    RETURN;
  END IF;

  UPDATE public.queue_entries
  SET client_confirmed = 'absent'
  WHERE id = p_entry_id;

  IF v_entry.professional_id IS NOT NULL THEN
    PERFORM public._insert_validated_notification(
      v_entry.professional_id,
      auth.uid(),
      'client_absent',
      jsonb_build_object(
        'title', 'Cliente ausente',
        'body', COALESCE(v_entry.client_name, 'Cliente') || ' nao confirmou presenca na cadeira.',
        'data', jsonb_build_object(
          'client_absent', true,
          'entry_id', p_entry_id,
          'client_name', COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id', v_entry.barbershop_id
        )
      ),
      'confirmar_presenca_cliente',
      true
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(uuid, boolean, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
  posicao_rank integer := 0;
  v_proximo record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT
      client_id,
      ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
    FROM public.queue_entries
    WHERE barbershop_id = NEW.barbershop_id
      AND status = 'waiting'
      AND client_id IS NOT NULL
  LOOP
    posicao_rank := rec.rank;
    PERFORM public._insert_validated_notification(
      rec.client_id,
      NEW.professional_id,
      'queue_update',
      jsonb_build_object(
        'title', 'Fila avancou',
        'body', CASE
          WHEN posicao_rank = 1 THEN 'Voce e o proximo! Dirija-se a cadeira.'
          ELSE 'Voce esta na posicao ' || posicao_rank || ' da fila.'
        END,
        'data', jsonb_build_object(
          'position', posicao_rank,
          'barbershop_id', NEW.barbershop_id,
          'is_next', posicao_rank = 1
        )
      ),
      'fn_notify_queue_clients',
      false
    );
  END LOOP;

  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qe.id AS entry_id, COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
  INTO v_proximo
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.barbershop_id = NEW.barbershop_id
    AND qe.status = 'waiting'
  ORDER BY qe.position ASC
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

  RETURN NEW;
END;
$$;
