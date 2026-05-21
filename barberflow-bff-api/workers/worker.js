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
const { NotificationHandler }     = require('../application/handlers/NotificationHandler');
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

const PushService = require('../services/PushService');
const pushService = new PushService({ supabase });

// Stubs para repositórios ainda não implementados
const mediaRepository     = { save: async () => {} };   // TODO: implementar
const imageProcessor      = { process: async () => ({}) }; // TODO: implementar
const feedRepository      = { generate: async () => {} }; // TODO: implementar
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

registry
  .register(new MediaProcessingHandler({ imageProcessor, mediaRepository }))
  .register(new NotificationHandler({ pushService }))
  .register(new FeedGenerationHandler({ feedRepository, cacheService: { delByPrefix: async () => {} } }))
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
