'use strict';

const { CacheKeyBuilder }   = require('../cache/CacheKeyBuilder');

/**
 * CacheInvalidationSubscriber — Invalida chaves de cache em resposta a eventos de domínio.
 *
 * Padrão: Observer / Event-Driven Invalidation.
 * Desacopla a lógica de invalidação dos use cases — cada use case apenas dispara
 * o evento; este subscriber decide o que invalidar.
 *
 * Regras de invalidação:
 *   AgendamentoCriado       → invalida listas de agendamento do cliente e profissional
 *   AgendamentoAtualizado   → invalida o item individual + listas relacionadas
 *   FilaEntradaCriada       → invalida lista e contagem da fila da barbearia
 *   FilaEntradaAtualizada   → invalida item da entrada + lista + contagem
 */
class CacheInvalidationSubscriber {
  /** @type {import('../cache/SingleFlightCache').SingleFlightCache} */
  #cache;

  /**
   * @param {{ cache: import('../cache/SingleFlightCache').SingleFlightCache }} deps
   */
  constructor({ cache }) {
    if (!cache) throw new TypeError('CacheInvalidationSubscriber: cache é obrigatório');
    this.#cache = cache;
  }

  /**
   * Registra todos os handlers no publisher.
   * @param {import('./DomainEventPublisher').DomainEventPublisher} publisher
   */
  register(publisher) {
    publisher.subscribe('AgendamentoCriado',     e => this.#onAgendamentoCriado(e));
    publisher.subscribe('AgendamentoAtualizado', e => this.#onAgendamentoAtualizado(e));
    publisher.subscribe('FilaEntradaCriada',     e => this.#onFilaEntradaCriada(e));
    publisher.subscribe('FilaEntradaAtualizada', e => this.#onFilaEntradaAtualizada(e));
    publisher.subscribe('NewPost',               () => this.#onNewPost());
    publisher.subscribe('Block',                 e => this.#onFeedRelationshipChanged(e));
    publisher.subscribe('Unfollow',              e => this.#onFeedRelationshipChanged(e));
  }

  // ── Handlers privados ──────────────────────────────────────────

  /**
   * Criação de agendamento: invalida listas do cliente e profissional.
   */
  async #onAgendamentoCriado(event) {
    await Promise.all([
      this.#invalidateListAgendamento({ clienteId: event.clienteId }),
      this.#invalidateListAgendamento({ profissionalId: event.profissionalId }),
    ]);
  }

  /**
   * Atualização de agendamento (status etc.): invalida item e listas.
   */
  async #onAgendamentoAtualizado(event) {
    const key = CacheKeyBuilder.build('agendamento', 'agendamento', event.aggregateId);
    await Promise.all([
      this.#cache.del(key),
      this.#invalidateListAgendamento({ clienteId: event.clienteId }),
      this.#invalidateListAgendamento({ profissionalId: event.profissionalId }),
    ]);
  }

  /**
   * Nova entrada na fila: invalida lista e contagem da barbearia.
   */
  async #onFilaEntradaCriada(event) {
    await Promise.all([
      this.#cache.delByPrefix(CacheKeyBuilder.prefix('fila', 'entrada')),
      this.#invalidateFilaCount(event.barbershopId),
    ]);
  }

  /**
   * Atualização de entrada na fila: invalida item, lista e contagem.
   */
  async #onFilaEntradaAtualizada(event) {
    const key = CacheKeyBuilder.build('fila', 'entrada', event.aggregateId);
    await Promise.all([
      this.#cache.del(key),
      this.#cache.delByPrefix(CacheKeyBuilder.prefix('fila', 'entrada')),
      this.#invalidateFilaCount(event.barbershopId),
    ]);
  }

  async #onNewPost() {
    await this.#cache.delByPrefix(CacheKeyBuilder.prefix('feed', 'timeline'));
  }

  async #onFeedRelationshipChanged(event) {
    await this.#cache.delByPrefix(CacheKeyBuilder.prefix('feed', `timeline:${event.userId}`));
  }

  // ── Helpers ────────────────────────────────────────────────────

  async #invalidateListAgendamento(params) {
    const key = CacheKeyBuilder.buildList('agendamento', 'agendamento', params);
    await this.#cache.del(key);
  }

  async #invalidateFilaCount(barbershopId) {
    const key = CacheKeyBuilder.buildList('fila', 'count', { barbershopId });
    await this.#cache.del(key);
  }
}

module.exports = { CacheInvalidationSubscriber };
