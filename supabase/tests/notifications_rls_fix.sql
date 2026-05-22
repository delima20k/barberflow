-- Staging regression script for 20260522000004_notifications_rls_security_fix.sql.
-- Run with psql/Supabase SQL runner after the migration and inside a transaction.
-- Requires two active profiles in the staging database.

BEGIN;

SELECT id AS user_a
FROM public.profiles
WHERE is_active = true
ORDER BY created_at
LIMIT 1
\gset

SELECT id AS user_b
FROM public.profiles
WHERE is_active = true
  AND id <> :'user_a'
ORDER BY created_at
LIMIT 1
\gset

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text,
  true
);
SELECT set_config('app.notifications_test_user_a', :'user_a', true);
SELECT set_config('app.notifications_test_user_b', :'user_b', true);

-- Direct INSERT as authenticated must fail by RLS/guard.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES (current_setting('app.notifications_test_user_a')::uuid, 'sistema', 'insert direto proibido');
    RAISE EXCEPTION 'direct INSERT unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- Other-recipient call must fail.
DO $$
BEGIN
  BEGIN
    PERFORM public.create_notification(
      current_setting('app.notifications_test_user_b')::uuid,
      'sistema',
      '{"title":"forbidden","data":{}}'::jsonb
    );
    RAISE EXCEPTION 'other-recipient create_notification unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'notification_recipient_forbidden' THEN RAISE; END IF;
  END;
END;
$$;

-- Self notification with allowed type must succeed.
SELECT public.create_notification(
  :'user_a',
  'sistema',
  '{"title":"self ok","body":"staging","data":{"flow":"system"}}'::jsonb
) AS self_notification_id
\gset
SELECT set_config('app.notifications_test_self_id', :'self_notification_id', true);

-- Payload and type validators must reject unsafe input.
DO $$
BEGIN
  BEGIN
    PERFORM public.create_notification(
      current_setting('app.notifications_test_user_a')::uuid,
      'sistema',
      '{"free":"shape"}'::jsonb
    );
    RAISE EXCEPTION 'invalid payload unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'notification_invalid_payload' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_notification(
      current_setting('app.notifications_test_user_a')::uuid,
      'free_text_type',
      '{"title":"bad type","data":{}}'::jsonb
    );
    RAISE EXCEPTION 'invalid type unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'notification_invalid_type' THEN RAISE; END IF;
  END;
END;
$$;

-- Rate limit: the N+1 self notification in the same minute must fail.
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..9 LOOP
    PERFORM public.create_notification(
      current_setting('app.notifications_test_user_a')::uuid,
      'sistema',
      jsonb_build_object('title', 'rate limit ' || i, 'data', '{}'::jsonb)
    );
  END LOOP;

  BEGIN
    PERFORM public.create_notification(
      current_setting('app.notifications_test_user_a')::uuid,
      'sistema',
      '{"title":"rate limit N+1","data":{}}'::jsonb
    );
    RAISE EXCEPTION 'rate limit unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'notification_rate_limited' THEN RAISE; END IF;
  END;
END;
$$;

RESET ROLE;
SELECT public._insert_validated_notification(
  :'user_b',
  :'user_b',
  'sistema',
  '{"title":"select isolation","data":{}}'::jsonb,
  'notifications_rls_fix.sql',
  false
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text,
  true
);
SELECT set_config('app.notifications_test_user_b', :'user_b', true);

-- SELECT must not leak user B rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = current_setting('app.notifications_test_user_b')::uuid
      AND title = 'select isolation'
  ) THEN
    RAISE EXCEPTION 'SELECT leaked other recipient notification';
  END IF;
END;
$$;

-- UPDATE allows only read_at/deleted_at for own rows.
UPDATE public.notifications
SET read_at = now()
WHERE id = :'self_notification_id';

DO $$
BEGIN
  BEGIN
    UPDATE public.notifications
    SET title = 'mutated'
    WHERE id = current_setting('app.notifications_test_self_id')::uuid;
    RAISE EXCEPTION 'protected UPDATE unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'notification_update_fields_forbidden' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.notifications
SET deleted_at = now()
WHERE id = :'self_notification_id';

ROLLBACK;
