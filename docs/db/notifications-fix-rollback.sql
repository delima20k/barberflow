-- Rollback de seguranca para notifications.
-- Use somente em staging ou durante rollback de incidente aprovado:
-- reabrir INSERT/DELETE direto restaura o comportamento vulneravel anterior.

BEGIN;

DROP TRIGGER IF EXISTS trg_notifications_guard_insert ON public.notifications;
DROP TRIGGER IF EXISTS trg_notifications_guard_user_update ON public.notifications;
DROP TRIGGER IF EXISTS trg_notifications_guard_user_delete ON public.notifications;
DROP FUNCTION IF EXISTS public.notifications_guard_insert();
DROP FUNCTION IF EXISTS public.notifications_guard_user_update();
DROP FUNCTION IF EXISTS public.notifications_guard_user_delete();

DROP FUNCTION IF EXISTS public.create_notification(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public._insert_validated_notification(uuid, uuid, text, jsonb, text, boolean);

DROP POLICY IF EXISTS "notifications_update_read_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Legacy policy restored only for rollback parity. Reapply hardening ASAP.
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

DROP TABLE IF EXISTS public.notification_audit;
DROP TABLE IF EXISTS public.notification_rate_limits;
DROP TYPE IF EXISTS public.notification_type;

COMMIT;
