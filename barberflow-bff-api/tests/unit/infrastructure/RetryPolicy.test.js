'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { RetryPolicy }  = require('../../../infrastructure/queue/RetryPolicy');

describe('RetryPolicy', () => {
  it('cria policy com defaults', () => {
    const p = new RetryPolicy();
    assert.equal(p.maxAttempts, 3);
  });

  it('lança RangeError para maxAttempts < 1', () => {
    assert.throws(() => new RetryPolicy({ maxAttempts: 0 }), /maxAttempts/);
  });

  it('lança RangeError para maxDelayMs < baseDelayMs', () => {
    assert.throws(() => new RetryPolicy({ baseDelayMs: 5000, maxDelayMs: 1000 }), /maxDelayMs/);
  });

  it('delayFor calcula backoff exponencial sem jitter', () => {
    const p = new RetryPolicy({ baseDelayMs: 1000, maxDelayMs: 10_000, jitter: false });
    assert.equal(p.delayFor(1), 1000);
    assert.equal(p.delayFor(2), 2000);
    assert.equal(p.delayFor(3), 4000);
    assert.equal(p.delayFor(4), 8000);
    assert.equal(p.delayFor(5), 10_000); // capped pelo maxDelayMs
  });

  it('delayFor com jitter fica dentro do range [50%, 100%]', () => {
    const p = new RetryPolicy({ baseDelayMs: 1000, maxDelayMs: 30_000, jitter: true });
    for (let i = 0; i < 50; i++) {
      const d = p.delayFor(1);
      assert.ok(d >= 500 && d <= 1000, `delay fora do range: ${d}`);
    }
  });

  it('delayFor lança RangeError para attempt < 1', () => {
    const p = new RetryPolicy();
    assert.throws(() => p.delayFor(0), /attempt/);
  });

  it('toBullMQOptions retorna estrutura correta', () => {
    const p = new RetryPolicy({ maxAttempts: 4, baseDelayMs: 2000 });
    const opts = p.toBullMQOptions();
    assert.equal(opts.attempts, 4);
    assert.equal(opts.backoff.type, 'exponential');
    assert.equal(opts.backoff.delay, 2000);
  });

  it('factories criadas corretamente', () => {
    assert.equal(RetryPolicy.defaultPolicy().maxAttempts, 3);
    assert.equal(RetryPolicy.criticalPolicy().maxAttempts, 5);
    assert.equal(RetryPolicy.analyticsPolicy().maxAttempts, 2);
    assert.equal(RetryPolicy.webhookPolicy().maxAttempts, 5);
  });

  it('toJSON serializa a policy', () => {
    const p = new RetryPolicy({ maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 5000, jitter: false });
    const j = p.toJSON();
    assert.equal(j.maxAttempts, 2);
    assert.equal(j.baseDelayMs, 500);
    assert.equal(j.maxDelayMs, 5000);
    assert.equal(j.jitter, false);
  });
});
