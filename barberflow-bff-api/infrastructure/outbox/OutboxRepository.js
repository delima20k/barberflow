'use strict';

/**
 * OutboxRepository — Persistência de eventos de domínio para o Outbox Pattern.
 *
 * Tabela: domain_events_outbox
 * Colunas:
 *   id          UUID PK
 *   event_name  TEXT NOT NULL
 *   payload     JSONB NOT NULL DEFAULT '{}'
 *   queue       TEXT NOT NULL
 *   status      TEXT NOT NULL DEFAULT 'pending'  (pending|processing|done|failed)
 *   attempts    INTEGER NOT NULL DEFAULT 0
 *   created_at  TIMESTAMPTZ DEFAULT now()
 *   processed_at TIMESTAMPTZ
 *
 * Migration SQL — executar no Supabase SQL Editor:
 *
 *   CREATE TABLE IF NOT EXISTS domain_events_outbox (
 *     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     event_name   TEXT NOT NULL,
 *     payload      JSONB NOT NULL DEFAULT '{}',
 *     queue        TEXT NOT NULL,
 *     status       TEXT NOT NULL DEFAULT 'pending',
 *     attempts     INTEGER NOT NULL DEFAULT 0,
 *     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     processed_at TIMESTAMPTZ
 *   );
 *   CREATE INDEX idx_outbox_status_created
 *     ON domain_events_outbox(status, created_at)
 *     WHERE status = 'pending';
 *
 * Garantia at-least-once:
 *   - Evento salvo em PENDING antes de qualquer enqueue no BullMQ.
 *   - OutboxRelay lê PENDING, enfileira, marca DONE.
 *   - Em caso de crash entre enqueue e markDone: relay reenfileirará no restart.
 *   - Consumers são idempotentes (dedup por jobId = outbox.id).
 */
class OutboxRepository {
  #db;
  static TABLE = 'domain_events_outbox';

  /**
   * @param {{ supabase: object }} deps
   */
  constructor({ supabase }) {
    if (!supabase) throw new TypeError('OutboxRepository: supabase é obrigatório');
    this.#db = supabase;
  }

  /**
   * Persiste um evento de domínio como entrada pendente no outbox.
   * Deve ser chamado na mesma "transação" (sequência síncrona) da escrita principal.
   *
   * @param {{ eventName: string, payload: object, queue: string }} opts
   * @returns {Promise<string>} id da entrada gerada
   */
  async save({ eventName, payload, queue }) {
    const { data, error } = await this.#db
      .from(OutboxRepository.TABLE)
      .insert({ event_name: eventName, payload: payload ?? {}, queue, status: 'pending' })
      .select('id')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data.id;
  }

  /**
   * Lista entradas pendentes, ordenadas por criação (oldest-first).
   * @param {number} [limit=100]
   * @returns {Promise<Array<{ id: string, event_name: string, payload: object, queue: string, attempts: number }>>}
   */
  async listPending(limit = 100) {
    const { data, error } = await this.#db
      .from(OutboxRepository.TABLE)
      .select('id, event_name, payload, queue, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data ?? [];
  }

  /**
   * Atomic claim: muda status de 'pending' → 'processing' somente se ainda estiver
   * pendente. A cláusula .eq('status','pending') garante que apenas UMA instância
   * reivindica o evento — as demais recebem data=[] e retornam false.
   *
   * @param {string} id
   * @returns {Promise<boolean>} true se esta instância reivindicou o evento com sucesso
   */
  async markProcessing(id) {
    const { data } = await this.#db
      .from(OutboxRepository.TABLE)
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    return (data?.length ?? 0) > 0;
  }

  /**
   * Marca entrada como processada com sucesso.
   * @param {string} id
   */
  async markDone(id) {
    await this.#db
      .from(OutboxRepository.TABLE)
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', id);
  }

  /**
   * Incrementa tentativas e marca como falha.
   * @param {string} id
   */
  async markFailed(id) {
    const { data } = await this.#db
      .from(OutboxRepository.TABLE)
      .select('attempts')
      .eq('id', id)
      .single();
    const attempts = ((data?.attempts) ?? 0) + 1;
    await this.#db
      .from(OutboxRepository.TABLE)
      .update({ status: 'failed', attempts })
      .eq('id', id);
  }

  /**
   * Lista entradas falhas para reprocessamento manual.
   * @param {number} [limit=50]
   */
  async listFailed(limit = 50) {
    const { data, error } = await this.#db
      .from(OutboxRepository.TABLE)
      .select('id, event_name, payload, queue, attempts, created_at')
      .eq('status', 'failed')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data ?? [];
  }
}

module.exports = { OutboxRepository };
