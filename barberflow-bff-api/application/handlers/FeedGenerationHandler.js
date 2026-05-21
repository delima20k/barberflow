'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * FeedGenerationHandler — Gera/atualiza o feed de stories e destaques.
 *
 * O feed é computado em background: agrega stories recentes, ranqueia por
 * engajamento, persiste no banco e invalida o cache de feed do cliente.
 *
 * Payload esperado:
 *   barbershopId — UUID da barbearia cujo feed deve ser atualizado
 *   reason       — 'new_story' | 'story_deleted' | 'scheduled_refresh'
 *   triggeredBy  — UUID do usuário que disparou o evento (opcional)
 */
class FeedGenerationHandler extends JobHandler {
  #feedRepository;
  #cacheService;

  /**
   * @param {{
   *   feedRepository: { generate(barbershopId: string): Promise<void> },
   *   cacheService:   { delByPrefix(prefix: string): Promise<void> }
   * }} deps
   */
  constructor({ feedRepository, cacheService }) {
    super();
    if (!feedRepository) throw new TypeError('FeedGenerationHandler: feedRepository é obrigatório');
    if (!cacheService)   throw new TypeError('FeedGenerationHandler: cacheService é obrigatório');
    this.#feedRepository = feedRepository;
    this.#cacheService   = cacheService;
  }

  get jobType() { return JOB_TYPES.GENERATE_FEED; }

  async handle(job) {
    const { barbershopId, reason } = job.payload;

    if (!barbershopId) throw new Error('FeedGenerationHandler: barbershopId ausente');
    if (!reason)       throw new Error('FeedGenerationHandler: reason ausente');

    await this.#feedRepository.generate(barbershopId);

    // Invalida cache de feed para forçar re-fetch no próximo request
    await this.#cacheService.delByPrefix(`bf:feed:${barbershopId}`);
  }
}

module.exports = { FeedGenerationHandler };
