'use strict';

const { BaseUseCase } = require('./BaseUseCase');

/**
 * CachedUseCaseDecorator — Adiciona cache transparente a um use case de LEITURA.
 *
 * Padrão: Decorator sobre BaseUseCase.
 * A camada de aplicação permanece limpa: os use cases originais não sabem do cache.
 *
 * Uso:
 * ```js
 * const cachedBuscar = new CachedUseCaseDecorator({
 *   useCase:    new BuscarAgendamentoUseCase({ agendamentoRepository }),
 *   cacheService: singleFlightCache,
 *   keyFn:     (cmd) => CacheKeyBuilder.build('agendamento', 'agendamento', cmd.id),
 *   ttlSeconds: CACHE_TTL.AGENDAMENTO_SINGLE,
 * });
 * const result = await cachedBuscar.execute({ id: 'uuid' });
 * ```
 *
 * ATENÇÃO: usar apenas em use cases de LEITURA.
 * Use cases de escrita devem disparar eventos de domínio para invalidar o cache.
 *
 * @extends {BaseUseCase}
 */
class CachedUseCaseDecorator extends BaseUseCase {
  /** @type {BaseUseCase} */
  #wrapped;
  /** @type {import('../../../infrastructure/cache/SingleFlightCache').SingleFlightCache} */
  #cacheService;
  /** @type {(command: unknown) => string} */
  #keyFn;
  /** @type {number} */
  #ttlSeconds;

  /**
   * @param {{
   *   useCase:      BaseUseCase,
   *   cacheService: import('../../../infrastructure/cache/SingleFlightCache').SingleFlightCache,
   *   keyFn:        (command: unknown) => string,
   *   ttlSeconds:   number,
   * }} deps
   */
  constructor({ useCase, cacheService, keyFn, ttlSeconds }) {
    super();
    if (!useCase)      throw new TypeError('CachedUseCaseDecorator: useCase é obrigatório');
    if (!cacheService) throw new TypeError('CachedUseCaseDecorator: cacheService é obrigatório');
    if (typeof keyFn !== 'function') throw new TypeError('CachedUseCaseDecorator: keyFn deve ser uma função');
    if (typeof ttlSeconds !== 'number' || ttlSeconds < 0) throw new TypeError('CachedUseCaseDecorator: ttlSeconds deve ser número >= 0');

    this.#wrapped      = useCase;
    this.#cacheService = cacheService;
    this.#keyFn        = keyFn;
    this.#ttlSeconds   = ttlSeconds;
  }

  /**
   * @param {unknown} command
   * @returns {Promise<import('../../domain/shared/Result').Result<unknown, string>>}
   */
  async execute(command) {
    const key = this.#keyFn(command);

    return this.#cacheService.getOrCompute(
      key,
      () => this.#wrapped.execute(command),
      this.#ttlSeconds,
    );
  }
}

module.exports = { CachedUseCaseDecorator };
