'use strict';

const { createContainer, asClass, asValue, InjectionMode } = require('awilix');

const { getSupabaseClient } = require('../config/supabase');

// ── Infrastructure: cache ──────────────────────────────────────
const { MemoryCache }        = require('../infrastructure/cache/MemoryCache');
const { RedisCache }         = require('../infrastructure/cache/RedisCache');
const { CacheMetrics }       = require('../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }  = require('../infrastructure/cache/SingleFlightCache');

// ── Infrastructure: queue ──────────────────────────────────────
const { InMemoryQueueService } = require('../infrastructure/queue/InMemoryQueueService');
const { BullMQAdapter }        = require('../infrastructure/queue/BullMQAdapter');
const { DeadLetterQueue }      = require('../infrastructure/queue/DeadLetterQueue');

// ── Infrastructure: outbox ─────────────────────────────────────
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { OutboxRelay }      = require('../infrastructure/outbox/OutboxRelay');

// ── Application: handlers ──────────────────────────────────────
const { NotificationHandler }    = require('../application/handlers/NotificationHandler');
const { MediaProcessingHandler } = require('../application/handlers/MediaProcessingHandler');
const { FeedGenerationHandler }  = require('../application/handlers/FeedGenerationHandler');
const { WebhookHandler }         = require('../application/handlers/WebhookHandler');
const { AnalyticsHandler }       = require('../application/handlers/AnalyticsHandler');

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
  let redisClient = null;
  if (cacheDriver === 'redis' && process.env.REDIS_URL) {
    const Redis = require('ioredis'); // eslint-disable-line global-require
    redisClient = new Redis(process.env.REDIS_URL, { lazyConnect: true });
    container.register({ redisClient: asValue(redisClient) });
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

  // ── Queue service ──────────────────────────────────────────────
  // BullMQAdapter em produção (Redis disponível); InMemory nos demais envs
  const resolvedCacheForQueue = container.resolve('cache');
  const queueService = (cacheDriver === 'redis' && redisClient)
    ? new BullMQAdapter({ redisClient })
    : new InMemoryQueueService();
  container.register({ queueService: asValue(queueService) });
  container.register({ deadLetterQueue: asValue(new DeadLetterQueue({ cache: resolvedCacheForQueue })) });

  // ── Outbox ─────────────────────────────────────────────────────
  container.register({ outboxRepository: asValue(new OutboxRepository({ supabaseClient })) });
  const outboxRelay = new OutboxRelay({
    outboxRepository: new OutboxRepository({ supabaseClient }),
    queueService,
    intervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000),
  });
  container.register({ outboxRelay: asValue(outboxRelay) });

  // ── Job handlers (singleton — stateless) ──────────────────────
  // Deps reais são injetadas aqui; stubs usados onde serviço ainda não existe
  const pushServiceStub = {
    enviarAoBarbeiro: async () => ({ enviados: 0, invalidas: 0 }),
  };
  const imageProcessorStub = {
    process: async () => { throw new Error('imageProcessor not wired — inject BarbeariaMediaService'); },
  };
  const mediaRepositoryStub = { save: async () => {} };
  const feedRepositoryStub  = { generate: async () => [] };
  const analyticsRepoStub   = { track: async () => {} };
  const httpClientStub      = { post: async () => ({ ok: true, status: 200 }) };

  const notificationHandler  = new NotificationHandler({ pushService: pushServiceStub });
  const mediaHandler         = new MediaProcessingHandler({ imageProcessor: imageProcessorStub, mediaRepository: mediaRepositoryStub });
  const feedHandler          = new FeedGenerationHandler({ feedRepository: feedRepositoryStub, cacheService: resolvedCacheForQueue });
  const webhookHandler       = new WebhookHandler({ httpClient: httpClientStub });
  const analyticsHandler     = new AnalyticsHandler({ analyticsRepository: analyticsRepoStub });

  container.register({
    notificationHandler:  asValue(notificationHandler),
    mediaHandler:         asValue(mediaHandler),
    feedHandler:          asValue(feedHandler),
    webhookHandler:       asValue(webhookHandler),
    analyticsHandler:     asValue(analyticsHandler),
  });

  // Registra handlers no queueService in-memory (útil em testes de integração)
  if (queueService instanceof InMemoryQueueService) {
    queueService.registerHandler(notificationHandler);
    queueService.registerHandler(mediaHandler);
    queueService.registerHandler(feedHandler);
    queueService.registerHandler(webhookHandler);
    queueService.registerHandler(analyticsHandler);
  }

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
