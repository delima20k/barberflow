'use strict';

/**
 * worker.js — Ponto de entrada do processo de background workers.
 *
 * Executar em processo separado:
 *   NODE_ENV=production REDIS_URL=redis://... node workers/worker.js
 *
 * Este processo:
 *   1. Valida variáveis de ambiente
 *   2. Resolve dependências dos handlers via container Awilix
 *   3. Inicia WorkerRegistry com todos os handlers registrados
 *   4. Inicia OutboxRelay (polling do outbox → BullMQ)
 *   5. Gerencia shutdown gracioso (SIGTERM / SIGINT)
 */

process.title = 'bf-worker';

// ── Variáveis obrigatórias ─────────────────────────────────────
const REQUIRED_ENVS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REDIS_URL'];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    process.stderr.write(`[worker] Variável obrigatória ausente: ${key}\n`);
    process.exit(1);
  }
}

// ── Dependências ───────────────────────────────────────────────
const Redis = require('ioredis');

const { WorkerRegistry }        = require('./WorkerRegistry');
const { OutboxRelay }           = require('../infrastructure/outbox/OutboxRelay');
const { OutboxRepository }      = require('../infrastructure/outbox/OutboxRepository');
const { BullMQAdapter }         = require('../infrastructure/queue/BullMQAdapter');
const { QUEUES, RETRY_CONFIG }  = require('../config/queues');
const { RetryPolicy }           = require('../infrastructure/queue/RetryPolicy');

const { MediaProcessingHandler }  = require('../application/handlers/MediaProcessingHandler');
const { MediaPipeline }           = require('../application/media/MediaPipeline');
const { MediaPipelineProcessor }  = require('../application/media/MediaPipelineProcessor');
const { VirusScanStep }           = require('../application/media/steps/VirusScanStep');
const { MimeValidationStep }      = require('../application/media/steps/MimeValidationStep');
const { MetadataExtractStep }     = require('../application/media/steps/MetadataExtractStep');
const { ThumbnailStep }           = require('../application/media/steps/ThumbnailStep');
const { TranscodeStep }           = require('../application/media/steps/TranscodeStep');
const { CDNPublishStep }          = require('../application/media/steps/CDNPublishStep');
const { NotificationHandler }     = require('../application/handlers/NotificationHandler');
const { ChatDeliveryHandler }      = require('../application/handlers/ChatDeliveryHandler');
const { FeedGenerationHandler }   = require('../application/handlers/FeedGenerationHandler');
const { WebhookHandler }          = require('../application/handlers/WebhookHandler');
const { AnalyticsHandler }        = require('../application/handlers/AnalyticsHandler');

// ── Supabase ───────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── Redis connection ───────────────────────────────────────────
const redisConnection = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: null });

redisConnection.on('error', (err) => {
  process.stderr.write(`[worker] Redis error: ${err.message}\n`);
});

// ── BullMQ adapter + outbox ────────────────────────────────────
const queueService = new BullMQAdapter({ redisConnection });

const outboxRepo  = new OutboxRepository({ supabase });
const outboxRelay = new OutboxRelay({ outboxRepository: outboxRepo, queueService, intervalMs: 5_000 });

// ── Handler deps (stubs — substituir pelas implementações reais) ──
// Em produção, estes seriam resolvidos via container Awilix (buildContainer())
// mantendo a mesma lógica de DI já estabelecida.

const webpush = require('web-push');
const PushService = require('../services/PushService');
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:contato@barberflow.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}
const pushService = new PushService(supabase, webpush);

// Stubs para repositórios ainda não implementados
const { SupabaseMediaRepository }     = require('../infrastructure/media/SupabaseMediaRepository');
const { SupabaseMediaStorageGateway } = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { NoopVirusScanner }            = require('../infrastructure/media/NoopVirusScanner');
const { NoopVideoTranscoder }         = require('../infrastructure/media/NoopVideoTranscoder');
const { SupabaseFeedRepository }      = require('../infrastructure/feed/SupabaseFeedRepository');
const { FeedCache }                   = require('../infrastructure/feed/FeedCache');
const { RedisCache }                  = require('../infrastructure/cache/RedisCache');
const { SupabaseChatRepository }      = require('../infrastructure/chat/SupabaseChatRepository');
const { ChatPushGateway }             = require('../infrastructure/chat/ChatPushGateway');
const { BlockPolicy }                 = require('../domain/chat/policies/BlockPolicy');
const { PresenceService }             = require('../domain/realtime/PresenceService');
const { RedisPubSubAdapter }          = require('../infrastructure/realtime/RedisPubSubAdapter');
const { EventReplayBuffer }           = require('../infrastructure/realtime/EventReplayBuffer');
const { RealtimeMetrics }             = require('../infrastructure/realtime/RealtimeMetrics');
const { PublishToChannelUseCase }     = require('../application/realtime/PublishToChannelUseCase');
const { PresenceLink }                = require('../application/chat/PresenceLink');
const { MessageDispatcher }           = require('../application/chat/MessageDispatcher');

const mediaRepository = new SupabaseMediaRepository(supabase);
const mediaStorage = new SupabaseMediaStorageGateway({ db: supabase });
const mediaPipeline = new MediaPipeline([
  new VirusScanStep({ scanner: new NoopVirusScanner() }),
  new MimeValidationStep(),
  new MetadataExtractStep({ duplicateFinder: mediaRepository }),
  new ThumbnailStep(),
  new TranscodeStep({ transcoder: new NoopVideoTranscoder() }),
  new CDNPublishStep({ storage: mediaStorage, mediaRepository }),
]);
const imageProcessor = new MediaPipelineProcessor({
  pipeline: mediaPipeline,
  storage: mediaStorage,
  mediaRepository,
});
const feedRepository      = new SupabaseFeedRepository(supabase);
const chatRepository      = new SupabaseChatRepository(supabase);
const feedCache           = new FeedCache({ cache: new RedisCache({ redisClient: redisConnection }) });
const analyticsRepository = { track: async () => {} };    // TODO: implementar

// HttpClient simples para webhooks
const https = require('node:https');
const httpClient = {
  post: (url, body, headers, timeoutMs) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, res => resolve({ status: res.statusCode }));
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  }),
};

// ── WorkerRegistry ─────────────────────────────────────────────
const registry = new WorkerRegistry({ connection: redisConnection, concurrency: 5 });
const chatPublisher = new PublishToChannelUseCase({
  pubSubService: new RedisPubSubAdapter({ redisClient: redisConnection }),
  eventReplayBuffer: new EventReplayBuffer({ redisClient: redisConnection }),
  realtimeMetrics: new RealtimeMetrics(),
});
const chatBlockPolicy = new BlockPolicy({ blockRepository: chatRepository });
const chatDispatcher = new MessageDispatcher({
  publishToChannelUseCase: chatPublisher,
  presenceLink: new PresenceLink({ presenceService: new PresenceService() }),
  pushGateway: new ChatPushGateway({ pushService }),
  blockPolicy: chatBlockPolicy,
});

registry
  .register(new MediaProcessingHandler({ imageProcessor, mediaRepository }))
  .register(new NotificationHandler({ pushService }))
  .register(new ChatDeliveryHandler({ chatRepository, messageDispatcher: chatDispatcher }))
  .register(new FeedGenerationHandler({ feedRepository, cacheService: feedCache }))
  .register(new WebhookHandler({ httpClient }))
  .register(new AnalyticsHandler({ analyticsRepository }));

const ALL_QUEUES = Object.values(QUEUES).filter(q => q !== QUEUES.DLQ);
registry.start(ALL_QUEUES);

outboxRelay.start();

// eslint-disable-next-line no-console
console.info(`[worker] Iniciado. Filas: ${registry.activeQueues.join(', ')}`);

// ── Shutdown gracioso ──────────────────────────────────────────
async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.info(`[worker] ${signal} recebido — encerrando graciosamente...`);
  outboxRelay.stop();
  await registry.stop();
  await queueService.close();
  await redisConnection.quit().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  process.stderr.write(`[worker] uncaughtException: ${err.stack}\n`);
  shutdown('uncaughtException').catch(() => process.exit(1));
});
