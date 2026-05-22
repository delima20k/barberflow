CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  default_locale TEXT NOT NULL DEFAULT 'pt-BR',
  channels JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  channels_by_category JSONB NOT NULL DEFAULT '{}',
  quiet_hours JSONB,
  digest_by_category JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES notification_templates(id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'default' CHECK (priority IN ('high', 'default', 'low')),
  channels TEXT[] NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  digest_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delayed', 'delivered', 'failed', 'read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_digest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  digest_key TEXT NOT NULL,
  channels TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_delayed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channels TEXT[] NOT NULL DEFAULT '{}',
  release_after TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_in_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY,
  event_name TEXT NOT NULL,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_suppressions (
  endpoint TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_priority_status
  ON notifications (priority, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_dedup_lookup
  ON notification_dedup (user_id, template_id, dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_digest_user_key
  ON notification_digest_items (user_id, digest_key, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_in_app_unread
  ON notification_in_app (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_digest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delayed ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_in_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_suppressions ENABLE ROW LEVEL SECURITY;
