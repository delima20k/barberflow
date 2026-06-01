'use strict';

class SupabaseSchedulerRepository {
  #db;

  constructor({ supabase }) {
    if (!supabase) throw new TypeError('SupabaseSchedulerRepository.supabase obrigatorio');
    this.#db = supabase;
  }

  async startExecution(execution) {
    const row = execution.toJSON();
    const { error } = await this.#db.from('scheduler_task_executions').insert({
      id: row.id,
      task_name: row.taskName,
      owner_context: row.ownerContext,
      instance_id: row.instanceId,
      scheduled_for: row.scheduledFor.toISOString(),
      started_at: row.startedAt.toISOString(),
      status: row.status,
      attempts: row.attempts,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return execution;
  }

  async finishExecution(execution) {
    const row = execution.toJSON();
    const { error } = await this.#db.from('scheduler_task_executions').update({
      finished_at: row.finishedAt?.toISOString(),
      status: row.status,
      attempts: row.attempts,
      error: row.error,
      duration_ms: row.durationMs,
    }).eq('id', row.id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }

  async recordSkipped({ task, scheduledFor, instanceId, reason, now }) {
    await this.#db.from('scheduler_task_executions').insert({
      task_name: task.name,
      owner_context: task.ownerContext,
      instance_id: instanceId,
      scheduled_for: scheduledFor.toISOString(),
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      status: 'skipped',
      attempts: 0,
      error: reason,
      duration_ms: 0,
    });
  }

  async recordEvent(event) {
    await this.#db.from('scheduler_events').insert({
      event_name: event.eventName,
      task_name: event.taskName,
      execution_id: event.executionId,
      status: event.status,
      error: event.error,
      occurred_at: event.occurredAt,
    });
  }
}

module.exports = { SupabaseSchedulerRepository };
