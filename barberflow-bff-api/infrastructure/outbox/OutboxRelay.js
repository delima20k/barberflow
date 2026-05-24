'use strict';

/**
 * OutboxRelay — Relay do Outbox Pattern: lê eventos pendentes e enfileira no BullMQ.
 *
 * Garante at-least-once delivery:
 *   1. Lê PENDING do outbox em lotes
 *   2. Marca cada entrada como PROCESSING (evita relay duplo em multi-instância)
 *   3. Enfileira no queueService usando o outbox.id como jobId (dedupe no consumer)
 *   4. Marca como DONE após enqueue bem-sucedido
 *   5. Em falha: marca como FAILED e tenta novamente no próximo tick
 *
 * Nota sobre atomicidade:
 *   O outbox não é atualizado atomicamente com a escrita principal (Supabase não
 *   expõe transações multi-tabela via JS SDK). Use cases devem chamar
 *   `outboxRepository.save()` logo após a escrita principal para minimizar a janela.
 *   Evolução: usar Supabase Edge Function + pg_notify para gatilho transacional.
 */
class OutboxRelay {
  #outboxRepo;
  #queueService;
  #intervalMs;
  #timer = null;
  #running = false;
  #ticksProcessed = 0;

  /**
   * @param {{
   *   outboxRepository: import('./OutboxRepository').OutboxRepository,
   *   queueService:     import('../../domain/shared/ports/IQueueService').IQueueService,
   *   intervalMs?:      number
   * }} deps
   */
  constructor({ outboxRepository, queueService, intervalMs = 5_000 }) {
    if (!outboxRepository) throw new TypeError('OutboxRelay: outboxRepository é obrigatório');
    if (!queueService)     throw new TypeError('OutboxRelay: queueService é obrigatório');
    if (intervalMs < 100)  throw new RangeError('OutboxRelay: intervalMs deve ser >= 100ms');

    this.#outboxRepo  = outboxRepository;
    this.#queueService = queueService;
    this.#intervalMs  = intervalMs;
  }

  /**
   * Inicia o relay em loop.
   * Executa o primeiro tick imediatamente, depois a cada intervalMs.
   */
  start() {
    if (this.#running) return;
    this.#running = true;
    this.#tick();
    this.#timer = setInterval(() => this.#tick(), this.#intervalMs);
    // unref: não impede o processo de fechar quando o relay é a única operação pendente
    if (this.#timer.unref) this.#timer.unref();
  }

  /** Para o relay. */
  stop() {
    if (!this.#running) return;
    this.#running = false;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Executa um tick manualmente (útil em testes). */
  async runOnce() {
    return this.#tick();
  }

  get isRunning() { return this.#running; }
  get ticksProcessed() { return this.#ticksProcessed; }

  // ── Lógica interna ─────────────────────────────────────────────

  async #tick() {
    let rows;
    try {
      rows = await this.#outboxRepo.listPending(100);
    } catch {
      return; // Silencioso — loga na próxima tentativa
    }

    if (rows.length === 0) return;

    const relays = rows.map(row => this.#relayOne(row));
    await Promise.allSettled(relays);
    this.#ticksProcessed++;
  }

  async #relayOne(row) {
    try {
      const claimed = await this.#outboxRepo.markProcessing(row.id);
      if (!claimed) return; // outra instância reivindicou primeiro — não processar
      await this.#queueService.enqueue(row.queue, row.event_name, row.payload, {
        jobId: row.id, // ID determinístico → consumer deduplica
      });
      await this.#outboxRepo.markDone(row.id);
    } catch {
      await this.#outboxRepo.markFailed(row.id).catch(() => {});
    }
  }
}

module.exports = { OutboxRelay };
