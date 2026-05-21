'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { Job }          = require('../../../application/shared/Job');
const { QUEUES, JOB_TYPES } = require('../../../config/queues');

describe('Job', () => {
  it('cria job válido com defaults', () => {
    const result = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: { fileId: 'f1' } });
    assert.ok(result.isOk());
    const job = result.getValue();
    assert.ok(typeof job.id === 'string' && job.id.length > 0);
    assert.equal(job.type, JOB_TYPES.PROCESS_MEDIA);
    assert.equal(job.queue, QUEUES.MEDIA);
    assert.deepEqual(job.payload, { fileId: 'f1' });
    assert.equal(job.priority, 5);
    assert.equal(job.attempts, 0);
    assert.equal(job.maxAttempts, 3);
    assert.equal(job.processedAt, null);
    assert.equal(job.failedReason, null);
    assert.equal(job.isExhausted, false);
  });

  it('aceita id determinístico', () => {
    const result = Job.create({ id: 'my-id', type: JOB_TYPES.SEND_NOTIFICATION, queue: QUEUES.NOTIFICATIONS, payload: {} });
    assert.ok(result.isOk());
    assert.equal(result.getValue().id, 'my-id');
  });

  it('falha se type ausente', () => {
    const result = Job.create({ queue: QUEUES.MEDIA, payload: {} });
    assert.ok(result.isFail());
    assert.match(result.getError(), /type/);
  });

  it('falha se queue ausente', () => {
    const result = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, payload: {} });
    assert.ok(result.isFail());
    assert.match(result.getError(), /queue/);
  });

  it('aceita payload omitido — defaulta para {}', () => {
    const result = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA });
    assert.ok(result.isOk());
    assert.deepEqual(result.getValue().payload, {});
  });

  it('falha se priority < 1', () => {
    const result = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {}, priority: 0 });
    assert.ok(result.isFail());
    assert.match(result.getError(), /priority/);
  });

  it('withAttempt incrementa attempts sem alterar outros campos', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: { x: 1 } }).getValue();
    const next = job.withAttempt();
    assert.equal(next.attempts, 1);
    assert.equal(next.type, job.type);
    assert.equal(next.id, job.id);
    assert.deepEqual(next.payload, { x: 1 });
  });

  it('fail incrementa attempts e seta failedReason', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {} }).getValue();
    const failed = job.fail('timeout');
    assert.equal(failed.attempts, 1);
    assert.equal(failed.failedReason, 'timeout');
    assert.equal(job.attempts, 0); // original inalterado
  });

  it('isExhausted quando attempts === maxAttempts', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {}, maxAttempts: 2 }).getValue();
    const a1 = job.fail('err1');
    const a2 = a1.fail('err2');
    assert.equal(a1.isExhausted, false);
    assert.equal(a2.isExhausted, true);
  });

  it('complete seta processedAt', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: {} }).getValue();
    const done = job.complete();
    assert.ok(done.processedAt !== null);
    assert.equal(job.processedAt, null); // original inalterado
  });

  it('payload retorna cópia — mutações externas não afetam o Job', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: { a: 1 } }).getValue();
    const p = job.payload;
    p.a = 999;
    assert.equal(job.payload.a, 1);
  });

  it('toJSON serializa todas as props', () => {
    const job = Job.create({ type: JOB_TYPES.PROCESS_MEDIA, queue: QUEUES.MEDIA, payload: { x: 2 } }).getValue();
    const json = job.toJSON();
    assert.equal(json.type, JOB_TYPES.PROCESS_MEDIA);
    assert.equal(json.queue, QUEUES.MEDIA);
    assert.deepEqual(json.payload, { x: 2 });
  });
});
