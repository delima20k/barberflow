'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * FeedGenerationHandler — Gera/atualiza o feed de stories e destaques.
 *
 * O feed é computado em background: agrega stories recentes, ranqueia por
 * engajamento, persiste no banco e invalida o cache de feed do cliente.
 *
 * Payload novo:
 *   itemId, authorId, fanoutMode, followerLimit.
 * Payload legado ainda aceito:
 *   barbershopId, reason.
 */
class FeedGenerationHandler extends JobHandler {
  #feedRepository;
  #cacheService;

  /**
   * @param {{
   *   feedRepository: { fanoutToFollowers(itemId: string, authorId: string, limit: number): Promise<object>, generate?(barbershopId: string): Promise<void> },
   *   cacheService:   { delByPrefix?(prefix: string): Promise<void>, invalidateUser?(userId: string): Promise<void> }
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
    const { itemId, authorId, fanoutMode, followerLimit, barbershopId, reason } = job.payload;

    if (itemId && authorId) {
      if (fanoutMode === 'pull') return;
      const fanout = await this.#feedRepository.fanoutToFollowers(itemId, authorId, followerLimit);
      await Promise.all((fanout.userIds ?? []).map(userId => this.#invalidateUser(userId)));
      return;
    }

    if (!barbershopId) throw new Error('FeedGenerationHandler: barbershopId ausente');
    if (!reason)       throw new Error('FeedGenerationHandler: reason ausente');

    await this.#feedRepository.generate(barbershopId);

    // Invalida cache de feed para forçar re-fetch no próximo request
    await this.#cacheService.delByPrefix(`bf:feed:${barbershopId}`);
  }

  async #invalidateUser(userId) {
    if (this.#cacheService.invalidateUser) return this.#cacheService.invalidateUser(userId);
    if (this.#cacheService.delByPrefix) return this.#cacheService.delByPrefix(`bf:feed:timeline:${userId}:`);
  }
}

module.exports = { FeedGenerationHandler };
