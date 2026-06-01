'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { CacheMetrics } = require('../../../infrastructure/cache/CacheMetrics');

describe('CacheMetrics', () => {
  it('começa com snapshot zerado', () => {
    const m = new CacheMetrics();
    assert.deepEqual(m.getSnapshot(), { hits: 0, misses: 0, evictions: 0, hitRatio: 0, avgLatencyMs: 0 });
  });

  it('registra hit corretamente', () => {
    const m = new CacheMetrics();
    m.recordHit(5);
    const s = m.getSnapshot();
    assert.equal(s.hits, 1);
    assert.equal(s.misses, 0);
    assert.equal(s.hitRatio, 1);
    assert.equal(s.avgLatencyMs, 5);
  });

  it('registra miss corretamente', () => {
    const m = new CacheMetrics();
    m.recordMiss(10);
    const s = m.getSnapshot();
    assert.equal(s.misses, 1);
    assert.equal(s.hits, 0);
    assert.equal(s.hitRatio, 0);
    assert.equal(s.avgLatencyMs, 10);
  });

  it('calcula hitRatio com mistura de hits e misses', () => {
    const m = new CacheMetrics();
    m.recordHit(0);
    m.recordHit(0);
    m.recordMiss(0);
    // 2 hits / 3 total = 0.6667
    assert.equal(m.getSnapshot().hitRatio, 0.6667);
  });

  it('registra evictions', () => {
    const m = new CacheMetrics();
    m.recordEviction();
    m.recordEviction();
    assert.equal(m.getSnapshot().evictions, 2);
  });

  it('calcula latência média', () => {
    const m = new CacheMetrics();
    m.recordHit(10);
    m.recordMiss(20);
    assert.equal(m.getSnapshot().avgLatencyMs, 15);
  });

  it('reset() zera tudo', () => {
    const m = new CacheMetrics();
    m.recordHit(5);
    m.recordMiss(10);
    m.recordEviction();
    m.reset();
    assert.deepEqual(m.getSnapshot(), { hits: 0, misses: 0, evictions: 0, hitRatio: 0, avgLatencyMs: 0 });
  });
});
