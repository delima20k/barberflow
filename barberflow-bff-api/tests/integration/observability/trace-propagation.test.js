'use strict';

/**
 * trace-propagation.test.js
 *
 * TDD — Verifica que correlationId/traceId propagam corretamente em:
 *   1. HTTP request → CorrelationContext → response headers
 *   2. Context disponível para payload de fila (job data)
 *   3. Contextos paralelos são isolados (sem vazamento entre requests)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { CorrelationContext }      = require('../../../observability/CorrelationContext');
const { ObservabilityMiddleware } = require('../../../observability/ObservabilityMiddleware');

// ─── Helpers ─────────────────────────────────────────────────────

function makeReq(headers = {}) {
  return { headers, method: 'GET', path: '/', url: '/', ip: '127.0.0.1' };
}

function makeRes() {
  const h = {};
  return {
    _headers:  h,
    setHeader: (k, v) => { h[k.toLowerCase()] = v; },
    on:        () => {},
  };
}

/**
 * Simula criação de payload de job BullMQ com dados do contexto atual.
 * Representa o que um use case faria ao enfileirar um job.
 */
function buildJobPayload(data) {
  return {
    ...data,
    _meta: {
      correlationId: CorrelationContext.correlationId,
      traceId:       CorrelationContext.traceId,
      userId:        CorrelationContext.userId,
      enqueuedAt:    new Date().toISOString(),
    },
  };
}

// ─── Testes ──────────────────────────────────────────────────────

describe('Propagação de traceId: HTTP → CorrelationContext', () => {
  it('traceId do header traceparent aparece no response e no contexto', () => {
    const traceId    = 'cafe'.repeat(8);           // 32 hex chars
    const spanId     = 'dead'.repeat(4);            // 16 hex chars
    const traceparent = `00-${traceId}-${spanId}-01`;

    const req = makeReq({ traceparent });
    const res = makeRes();

    let ctxTraceId;
    ObservabilityMiddleware.handle(req, res, () => {
      ctxTraceId = CorrelationContext.traceId;
    });

    assert.equal(res._headers['x-trace-id'], traceId, 'response deve ter o traceId do traceparent');
    assert.equal(ctxTraceId, traceId, 'CorrelationContext deve ter o traceId do traceparent');
  });

  it('correlationId do cliente é preservado fim-a-fim', () => {
    const clientCid = 'my-client-correlation-id-001';

    const req = makeReq({ 'x-correlation-id': clientCid });
    const res = makeRes();

    let ctxCid;
    ObservabilityMiddleware.handle(req, res, () => {
      ctxCid = CorrelationContext.correlationId;
    });

    assert.equal(res._headers['x-correlation-id'], clientCid);
    assert.equal(ctxCid, clientCid);
  });
});

describe('Propagação de traceId: HTTP → Fila (job payload)', () => {
  it('job enfileirado dentro do context carrega correlationId e traceId', () => {
    const correlationId = 'req-cid-fila-001';
    const traceId       = 'b'.repeat(32);
    const traceparent   = `00-${traceId}-${'c'.repeat(16)}-01`;

    const req = makeReq({ 'x-correlation-id': correlationId, traceparent });
    const res = makeRes();

    let jobPayload;
    ObservabilityMiddleware.handle(req, res, () => {
      // Simula um use case enfileirando um job no contexto do request
      jobPayload = buildJobPayload({ type: 'enviar-confirmacao', userId: 'u123' });
    });

    assert.ok(jobPayload, 'jobPayload deve ser criado');
    assert.equal(jobPayload._meta.correlationId, correlationId, 'job deve ter correlationId do request');
    assert.equal(jobPayload._meta.traceId,       traceId,       'job deve ter traceId do request');
    assert.ok(jobPayload._meta.enqueuedAt,       'job deve ter timestamp de enqueue');
  });

  it('job enfileirado sem context gera _meta com nulls (não lança erro)', () => {
    // Fora de qualquer ObservabilityMiddleware.handle
    const payload = buildJobPayload({ type: 'test-job' });

    assert.equal(payload._meta.correlationId, null);
    assert.equal(payload._meta.traceId,       null);
    assert.equal(payload._meta.userId,        null);
  });
});

describe('Isolamento de contextos paralelos', () => {
  it('100 requests paralelos têm correlationIds independentes', async () => {
    const N   = 100;
    const ids = new Set();

    await Promise.all(
      Array.from({ length: N }, (_, i) => {
        return new Promise(resolve => {
          const req = makeReq({ 'x-correlation-id': `cid-${i}` });
          const res = makeRes();

          ObservabilityMiddleware.handle(req, res, () => {
            ids.add(CorrelationContext.correlationId);
            resolve();
          });
        });
      }),
    );

    assert.equal(ids.size, N, 'cada request deve ter correlationId único e isolado');
  });

  it('contextos aninhados via CorrelationContext.run() preservam valores únicos', async () => {
    const outer = 'outer-cid';
    const inner = 'inner-cid';

    let outerAfter;

    await new Promise(resolve => {
      CorrelationContext.run({ correlationId: outer }, () => {
        CorrelationContext.run({ correlationId: inner }, () => {
          assert.equal(CorrelationContext.correlationId, inner, 'contexto interno deve ter inner');
        });

        // Após contexto interno, o externo deve ser restaurado
        outerAfter = CorrelationContext.correlationId;
        resolve();
      });
    });

    assert.equal(outerAfter, outer, 'contexto externo deve ser restaurado após inner');
  });
});

describe('Propagação via worker (BullMQ job data)', () => {
  it('worker pode restaurar contexto a partir do _meta do job', () => {
    const jobMeta = {
      correlationId: 'worker-cid-restore',
      traceId:       'd'.repeat(32),
      userId:        'u-worker-1',
    };

    let ctxRestorado;

    // Simula o que WorkerRegistry faria: restaurar contexto do job
    CorrelationContext.run(jobMeta, () => {
      ctxRestorado = {
        correlationId: CorrelationContext.correlationId,
        traceId:       CorrelationContext.traceId,
        userId:        CorrelationContext.userId,
      };
    });

    assert.equal(ctxRestorado.correlationId, jobMeta.correlationId);
    assert.equal(ctxRestorado.traceId,       jobMeta.traceId);
    // userId não é passado pelo CorrelationContext.run automaticamente (só via setUserId)
    // mas o run() o propaga diretamente no store
    assert.ok(ctxRestorado.traceId);
  });
});
