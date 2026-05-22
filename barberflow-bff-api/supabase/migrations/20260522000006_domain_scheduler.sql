CREATE TABLE IF NOT EXISTS scheduler_task_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name TEXT NOT NULL,
  owner_context TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'timeout', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduler_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  execution_id UUID,
  status TEXT NOT NULL,
  error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_executions_task_started
  ON scheduler_task_executions (task_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_executions_status_started
  ON scheduler_task_executions (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_events_task_time
  ON scheduler_events (task_name, occurred_at DESC);

ALTER TABLE scheduler_task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_events ENABLE ROW LEVEL SECURITY;
