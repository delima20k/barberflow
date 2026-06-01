'use strict';

/**
 * Testes de integração do pipeline de filas.
 *
 * Usa InMemoryQueueService como substituto do BullMQ (mesma interface IQueueService).
 * Sem Redis real: zero deps extras, determinístico, rápido.
 *
 * O que é testado aqui:
 *   1. Pipeline completo: enqueue → processAll → side effect → ack (status 'ok')
 *   2. Deduplificação: mesmo jobId enfileirado 2× é processado apenas 1×
 *   3. Retry automático: handler falha → job retorna para fila → nova tentativa
 *   4. DLQ: handler falha maxAttempts vezes → job vai para DLQ (status 'dlq')
 *   5. Prioridade: jobs com menor priority number processados antes
 *   6. OutboxRelay end-to-end: save() → relay.runOnce() → enqueue → processAll
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert                                   = require('node:assert/strict');

const { InMemoryQueueService }  = require('../../infrastructure/queue/InMemoryQueueService');
const { OutboxRelay }           = require('../../infrastructure/outbox/OutboxRelay');
const { DeadLetterQueue }       = require('../../infrastructure/queue/DeadLetterQueue');
const { MemoryCache }           = require('../../infrastructure/cache/MemoryCache');
const { CacheMetrics }          = require('../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }     = require('../../infrastructure/cache/SingleFlightCache');
const { NotificationHandler }   = require('../../application/handlers/NotificationHandler');
const { MediaProcessingHandler } = require('../../application/handlers/MediaProcessingHandler');
const { QUEUES, JOB_TYPES }     = require('../../config/queues');

function buildQueue() {
  return new InMemoryQueueService();
}

function buildCache() {
  return new SingleFlightCache({ cache: new MemoryCache(), metrics: new CacheMetrics() });
}

// ── 1. Pipeline completo: enqueue → processAll → side effect ──────
describe('[Integration] InMemoryQueueService — pipeline completo', () => {
  it('enqueue → processAll → side effect produzido', async () => {
    const q = buildQueue();
    const sideEffects = [];

    const pushService = {
      enviarAoBarbeiro: async opts => { sideEffects.push(opts); return { enviados: 1, invalidas: 0 }; },
    };
    q.registerHandler(new NotificationHandler({ pushService }));

    const { id, deduplicated } = await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, {
      professionalId: 'p1', type: 'client_arrived', clienteNome: 'Ana',
    });
    assert.equal(deduplicated, false);

    const results = await q.processAll(QUEUES.NOTIFICATIONS);

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'ok');
    assert.equal(results[0].jobId, id);
    assert.equal(sideEffects.length, 1);
    assert.equal(sideEffects[0].type, 'client_arrived');
  });

  it('processAll em fila vazia retorna []', async () => {
    const q = buildQueue();
    const results = await q.processAll(QUEUES.MEDIA);
    assert.deepEqual(results, []);
  });
});

// ── 2. Deduplificação por jobId ────────────────────────────────────
describe('[Integration] Deduplificação por jobId', () => {
  it('mesmo jobId enfileirado 2× é processado apenas 1×', async () => {
    const q = buildQueue();
    let calls = 0;
    const pushService = { enviarAoBarbeiro: async () => { calls++; return {}; } };
    q.registerHandler(new NotificationHandler({ pushService }));

    const payload = { professionalId: 'p1', type: 'test' };
    const r1 = await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, payload, { jobId: 'dedup-job' });
    const r2 = await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, payload, { jobId: 'dedup-job' });

    assert.equal(r1.deduplicated, false);
    assert.equal(r2.deduplicated, true); // segundo enqueue ignorado

    await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(calls, 1, 'handler deve ser chamado apenas 1×');
  });

  it('jobId já processado não re-processa mesmo em nova enqueue', async () => {
    const q = buildQueue();
    let calls = 0;
    const pushService = { enviarAoBarbeiro: async () => { calls++; return {}; } };
    q.registerHandler(new NotificationHandler({ pushService }));

    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, { professionalId: 'p1', type: 'x' }, { jobId: 'idempotent-job' });
    await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(calls, 1);

    // Tenta enfileirar novamente após processamento
    const r = await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, { professionalId: 'p1', type: 'x' }, { jobId: 'idempotent-job' });
    assert.equal(r.deduplicated, true);
    await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(calls, 1, 'não deve processar novamente');
  });
});

// ── 3. Retry automático ────────────────────────────────────────────
describe('[Integration] Retry automático', () => {
  it('handler falha 1× e retenta com sucesso na 2ª chamada a processAll', async () => {
    const q = buildQueue();
    let callCount = 0;
    const imageProcessor = {
      process: async () => {
        callCount++;
        if (callCount < 2) throw new Error('falha temporária');
        return { data: Buffer.from('ok'), format: 'webp' };
      },
    };
    const mediaRepository = { save: async () => {} };

    q.registerHandler(new MediaProcessingHandler({ imageProcessor, mediaRepository }));

    await q.enqueue(QUEUES.MEDIA, JOB_TYPES.PROCESS_MEDIA, { fileId: 'f1', ownerId: 'o1', tipo: 'logo' });

    const r1 = await q.processAll(QUEUES.MEDIA);
    assert.equal(r1[0].status, 'retry'); // 1ª tentativa falhou
    assert.equal(r1[0].attempts, 1);

    const r2 = await q.processAll(QUEUES.MEDIA);
    assert.equal(r2[0].status, 'ok'); // 2ª tentativa ok
    assert.equal(callCount, 2);
  });
});

// ── 4. Falha definitiva → DLQ ──────────────────────────────────────
describe('[Integration] DLQ — falha definitiva', () => {
  it('handler falha maxAttempts vezes → job vai para DLQ', async () => {
    const q = buildQueue();
    const onFailureCalls = [];

    const alwaysFail = {
      jobType: JOB_TYPES.SEND_NOTIFICATION,
      handle: async () => { throw new Error('falha permanente'); },
      onSuccess: async () => {},
      onFailure: async (job, err) => { onFailureCalls.push({ jobId: job.id, err: err.message }); },
    };

    q.registerHandler(alwaysFail);

    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION,
      { professionalId: 'p1', type: 'test' }, { maxAttempts: 2 });

    // processUntilEmpty lida com retries
    const results = await q.processUntilEmpty(QUEUES.NOTIFICATIONS);

    const dlqResult = results.find(r => r.status === 'dlq');
    assert.ok(dlqResult, 'deve ter um resultado com status dlq');
    assert.equal(dlqResult.error, 'falha permanente');

    // DLQ deve conter o job
    const dlqJobs = await q.getDLQ(QUEUES.NOTIFICATIONS);
    assert.equal(dlqJobs.length, 1);
    assert.equal(dlqJobs[0].failedReason, 'falha permanente');
    assert.equal(dlqJobs[0].attempts, 2);

    // onFailure hook deve ter sido chamado
    assert.equal(onFailureCalls.length, 1);
  });

  it('retry manual do DLQ reenfileira o job com attempts zerado', async () => {
    const q = buildQueue();
    let calls = 0;
    const handler = {
      jobType: JOB_TYPES.SEND_NOTIFICATION,
      handle: async () => { calls++; if (calls < 2) throw new Error('fail'); },
      onSuccess: async () => {}, onFailure: async () => {},
    };
    q.registerHandler(handler);

    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION,
      { professionalId: 'p1', type: 'x' }, { jobId: 'retry-test', maxAttempts: 1 });

    const r1 = await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(r1[0].status, 'dlq');

    // Retry manual
    await q.retryFailed(QUEUES.NOTIFICATIONS, 'retry-test');
    const r2 = await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(r2[0].status, 'ok');
    assert.equal(calls, 2);
  });
});

// ── 5. Prioridade de jobs ──────────────────────────────────────────
describe('[Integration] Prioridade de jobs', () => {
  it('jobs com menor priority processados antes dos de maior priority', async () => {
    const q = buildQueue();
    const order = [];

    const handler = {
      jobType: JOB_TYPES.SEND_NOTIFICATION,
      handle: async (job) => { order.push(job.payload.label); },
      onSuccess: async () => {}, onFailure: async () => {},
    };
    q.registerHandler(handler);

    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, { professionalId: 'p1', type: 'x', label: 'low' },    { priority: 10 });
    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, { professionalId: 'p2', type: 'x', label: 'high' },   { priority: 1 });
    await q.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_NOTIFICATION, { professionalId: 'p3', type: 'x', label: 'normal' }, { priority: 5 });

    await q.processAll(QUEUES.NOTIFICATIONS);

    assert.deepEqual(order, ['high', 'normal', 'low']);
  });
});

// ── 6. OutboxRelay end-to-end ──────────────────────────────────────
describe('[Integration] OutboxRelay end-to-end', () => {
  it('relay lê pendentes do outbox e enfileira via queueService', async () => {
    const q = buildQueue();
    const sideEffects = [];

    const pushService = { enviarAoBarbeiro: async opts => { sideEffects.push(opts); return {}; } };
    q.registerHandler(new NotificationHandler({ pushService }));

    // OutboxRepository in-memory stub
    const rows = [];
    const outboxRepo = {
      listPending:     async () => [...rows.filter(r => r.status === 'pending')],
      markProcessing:  async id => { const r = rows.find(r => r.id === id); if (r) r.status = 'processing'; },
      markDone:        async id => { const r = rows.find(r => r.id === id); if (r) r.status = 'done'; },
      markFailed:      async id => { const r = rows.find(r => r.id === id); if (r) r.status = 'failed'; },
    };

    // Simula escrita de evento no outbox por um use case
    rows.push({ id: 'outbox-1', event_name: JOB_TYPES.SEND_NOTIFICATION, queue: QUEUES.NOTIFICATIONS, status: 'pending', attempts: 0,
      payload: { professionalId: 'p1', type: 'client_arrived', clienteNome: 'Maria' } });

    const relay = new OutboxRelay({ outboxRepository: outboxRepo, queueService: q, intervalMs: 100 });
    await relay.runOnce();

    // Relay deve ter marcado o evento como DONE
    assert.equal(rows[0].status, 'done');
    assert.equal(relay.ticksProcessed, 1);

    // Job enfileirado deve ser processável
    const results = await q.processAll(QUEUES.NOTIFICATIONS);
    assert.equal(results[0].status, 'ok');
    assert.equal(sideEffects.length, 1);
    assert.equal(sideEffects[0].clienteNome, 'Maria');
  });
});

// ── 7. DeadLetterQueue com cache ───────────────────────────────────
describe('[Integration] DeadLetterQueue com SingleFlightCache', () => {
  it('push + get + remove funcionam com cache real', async () => {
    const cache = buildCache();
    const dlq = new DeadLetterQueue({ cache });

    const { Job } = require('../../application/shared/Job');
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {}, maxAttempts: 1 }).getValue().fail('disk full');

    await dlq.push(job);
    const stored = await dlq.get(QUEUES.MEDIA, job.id);
    assert.ok(stored !== null);
    assert.equal(stored.failedReason, 'disk full');

    await dlq.remove(QUEUES.MEDIA, job.id);
    assert.equal(await dlq.get(QUEUES.MEDIA, job.id), null);
  });
});
