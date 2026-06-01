'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                       = require('node:assert/strict');
const { MemoryCache }              = require('../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }             = require('../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }        = require('../../../infrastructure/cache/SingleFlightCache');
const { DeadLetterQueue }          = require('../../../infrastructure/queue/DeadLetterQueue');
const { Job }                      = require('../../../application/shared/Job');
const { QUEUES, JOB_TYPES }        = require('../../../config/queues');

function makeCache() {
  return new SingleFlightCache({ cache: new MemoryCache(), metrics: new CacheMetrics() });
}

function makeExhaustedJob() {
  const job = Job.create({
    type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA,
    payload: { fileId: 'f1' }, maxAttempts: 2,
  }).getValue();
  return job.fail('timeout 1').fail('timeout 2');
}

describe('DeadLetterQueue', () => {
  it('lança TypeError se cache ausente', () => {
    assert.throws(() => new DeadLetterQueue({ cache: null }), /cache/);
  });

  it('push persiste job exaurido e get recupera', async () => {
    const dlq = new DeadLetterQueue({ cache: makeCache() });
    const job = makeExhaustedJob();

    await dlq.push(job);

    const stored = await dlq.get(job.queue, job.id);
    assert.ok(stored !== null);
    assert.equal(stored.jobId, job.id);
    assert.equal(stored.jobType, job.type);
    assert.equal(stored.attempts, 2);
    assert.equal(stored.failedReason, 'timeout 2');
    assert.ok(stored.failedAt);
  });

  it('get retorna null para job inexistente', async () => {
    const dlq = new DeadLetterQueue({ cache: makeCache() });
    const result = await dlq.get(QUEUES.MEDIA, 'nao-existe');
    assert.equal(result, null);
  });

  it('remove apaga job da DLQ', async () => {
    const dlq = new DeadLetterQueue({ cache: makeCache() });
    const job = makeExhaustedJob();
    await dlq.push(job);
    await dlq.remove(job.queue, job.id);
    const stored = await dlq.get(job.queue, job.id);
    assert.equal(stored, null);
  });

  it('purge remove todos os jobs de uma fila', async () => {
    const cache = makeCache();
    const dlq = new DeadLetterQueue({ cache });

    const j1 = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {}, maxAttempts: 1 }).getValue().fail('e1');
    const j2 = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {}, maxAttempts: 1 }).getValue().fail('e2');
    await dlq.push(j1);
    await dlq.push(j2);

    await dlq.purge(QUEUES.MEDIA);

    assert.equal(await dlq.get(QUEUES.MEDIA, j1.id), null);
    assert.equal(await dlq.get(QUEUES.MEDIA, j2.id), null);
  });

  it('DLQ.PREFIX é "bf:dlq"', () => {
    assert.equal(DeadLetterQueue.PREFIX, 'bf:dlq');
  });
});
