'use strict';

const { createContainer, asClass, asValue, InjectionMode } = require('awilix');

const { getSupabaseClient } = require('../config/supabase');

// ── Infrastructure: cache ──────────────────────────────────────
const { MemoryCache }        = require('../infrastructure/cache/MemoryCache');
const { RedisCache }         = require('../infrastructure/cache/RedisCache');
const { CacheMetrics }       = require('../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }  = require('../infrastructure/cache/SingleFlightCache');

// ── Infrastructure: db ─────────────────────────────────────────
const { AgendamentoRepository } = require('../infrastructure/db/AgendamentoRepository');
const { FilaRepository }        = require('../infrastructure/db/FilaRepository');
const { SupabaseUnitOfWork }    = require('../infrastructure/shared/SupabaseUnitOfWork');

// ── Infrastructure: events ─────────────────────────────────────
const { DomainEventPublisher }       = require('../infrastructure/events/DomainEventPublisher');
const { CacheInvalidationSubscriber } = require('../infrastructure/events/CacheInvalidationSubscriber');

// ── Application: use cases ─────────────────────────────────────
const { CriarAgendamentoUseCase }          = require('../application/agendamento/CriarAgendamentoUseCase');
const { AtualizarStatusAgendamentoUseCase } = require('../application/agendamento/AtualizarStatusAgendamentoUseCase');
const { BuscarAgendamentoUseCase }         = require('../application/agendamento/BuscarAgendamentoUseCase');
const { EntrarNaFilaUseCase }              = require('../application/fila/EntrarNaFilaUseCase');
const { AtualizarStatusFilaUseCase }       = require('../application/fila/AtualizarStatusFilaUseCase');
const { ListarFilaUseCase }               = require('../application/fila/ListarFilaUseCase');
const { CachedUseCaseDecorator }          = require('../application/shared/CachedUseCaseDecorator');

// ── Config ─────────────────────────────────────────────────────
const { CACHE_TTL }       = require('../config/cacheTtl');
const { CacheKeyBuilder } = require('../infrastructure/cache/CacheKeyBuilder');

// ── Interfaces: middlewares ────────────────────────────────────
const { IdempotencyMiddleware } = require('../interfaces/bff/middlewares/IdempotencyMiddleware');

/**
 * Monta e retorna o container awilix configurado.
 * Deve ser chamado uma vez no boot da aplicação.
 * @returns {import('awilix').AwilixContainer}
 */
function buildContainer() {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });

  // ── Infraestrutura base ────────────────────────────────────────
  const supabaseClient = getSupabaseClient();
  container.register({ supabaseClient: asValue(supabaseClient) });

  // ── Cache: driver raw (ICache) ─────────────────────────────────
  const cacheDriver = process.env.CACHE_DRIVER ?? 'memory';
  if (cacheDriver === 'redis' && process.env.REDIS_URL) {
    const Redis = require('ioredis'); // eslint-disable-line global-require
    container.register({
      redisClient: asValue(new Redis(process.env.REDIS_URL, { lazyConnect: true })),
    });
    container.register({ rawCache: asClass(RedisCache).singleton() });
  } else {
    container.register({ rawCache: asClass(MemoryCache).singleton() });
  }

  // ── Cache: métricas + single-flight ───────────────────────────
  // Singleton: um conjunto de métricas por processo
  const metrics = new CacheMetrics();
  container.register({ cacheMetrics: asValue(metrics) });

  // SingleFlightCache depende de rawCache + cacheMetrics (injeção via PROXY)
  container.register({ cache: asClass(SingleFlightCache).singleton() });

  // ── Idempotency middleware ─────────────────────────────────────
  container.register({ idempotencyMiddleware: asClass(IdempotencyMiddleware).singleton() });

  // ── Repositórios ───────────────────────────────────────────────
  container.register({
    unitOfWork:            asClass(SupabaseUnitOfWork).singleton(),
    agendamentoRepository: asClass(AgendamentoRepository).singleton(),
    filaRepository:        asClass(FilaRepository).singleton(),
  });

  // ── Event publisher + cache invalidation ──────────────────────
  const publisher = DomainEventPublisher.getInstance();
  container.register({ domainEventPublisher: asValue(publisher) });

  // Subscriber registra seus handlers no publisher imediatamente
  // (precisa de cache resolvido — usar resolve diretamente)
  const cacheForSubscriber = container.resolve('cache');
  const subscriber = new CacheInvalidationSubscriber({ cache: cacheForSubscriber });
  subscriber.register(publisher);
  container.register({ cacheInvalidationSubscriber: asValue(subscriber) });

  // ── Use Cases: write (scoped — nova instância por request) ──────
  container.register({
    criarAgendamentoUseCase:           asClass(CriarAgendamentoUseCase).scoped(),
    atualizarStatusAgendamentoUseCase: asClass(AtualizarStatusAgendamentoUseCase).scoped(),
    entrarNaFilaUseCase:               asClass(EntrarNaFilaUseCase).scoped(),
    atualizarStatusFilaUseCase:        asClass(AtualizarStatusFilaUseCase).scoped(),
  });

  // ── Use Cases: read com cache (singleton — key fn é pura) ───────
  const resolvedCache          = container.resolve('cache');
  const resolvedAgendamentoRepo = container.resolve('agendamentoRepository');
  const resolvedFilaRepo        = container.resolve('filaRepository');

  container.register({
    buscarAgendamentoUseCase: asValue(
      new CachedUseCaseDecorator({
        useCase:      new BuscarAgendamentoUseCase({ agendamentoRepository: resolvedAgendamentoRepo }),
        cacheService: resolvedCache,
        keyFn:        cmd => CacheKeyBuilder.build('agendamento', 'agendamento', cmd.id),
        ttlSeconds:   CACHE_TTL.AGENDAMENTO_SINGLE,
      }),
    ),

    listarFilaUseCase: asValue(
      new CachedUseCaseDecorator({
        useCase:      new ListarFilaUseCase({ filaRepository: resolvedFilaRepo }),
        cacheService: resolvedCache,
        keyFn:        cmd => CacheKeyBuilder.buildList('fila', 'entrada', { barbershopId: cmd.barbershopId }),
        ttlSeconds:   CACHE_TTL.FILA_LIST,
      }),
    ),
  });

  return container;
}

module.exports = { buildContainer };
