'use strict';

/**
 * log-spec.test.js
 *
 * TDD — Especificação de campos obrigatórios de log e propagação de
 * CorrelationContext (AsyncLocalStorage).
 */

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// SUT carregado de forma isolada — sem side-effects externos
const { CorrelationContext }      = require('../../../observability/CorrelationContext');
const { ObservabilityMiddleware } = require('../../../observability/ObservabilityMiddleware');

// ─── Helpers ─────────────────────────────────────────────────────

function fakeMock({ headers = {} } = {}) {
  const res = {
    _headers:  {},
    setHeader: function (k, v) { this._headers[k.toLowerCase()] = v; },
    on:        () => {},
  };
  const req = { headers, method: 'GET', path: '/', url: '/', ip: '127.0.0.1' };
  const calls = [];
  const next  = () => calls.push(1);
  next.calls  = calls;
  return { req, res, next };
}

// ─── CorrelationContext ───────────────────────────────────────────

describe('CorrelationContext', () => {
  afterEach(() => {
    // Nada a limpar — cada teste usa run() isolado
  });

  it('cria store com correlationId e traceId gerados automaticamente', () => {
    CorrelationContext.run({}, () => {
      const store = CorrelationContext.getStore();
      assert.ok(store.correlationId, 'correlationId deve ser gerado');
      assert.ok(store.traceId,       'traceId deve ser gerado');
      assert.ok(store.requestId,     'requestId deve ser gerado');
    });
  });

  it('preserva correlationId passado explicitamente', () => {
    const id = 'abc-123';
    CorrelationContext.run({ correlationId: id }, () => {
      assert.equal(CorrelationContext.correlationId, id);
    });
  });

  it('preserva traceId passado explicitamente', () => {
    const tid = 'a'.repeat(32);
    CorrelationContext.run({ traceId: tid }, () => {
      assert.equal(CorrelationContext.traceId, tid);
    });
  });

  it('retorna objeto vazio fora de contexto', () => {
    // Fora de qualquer run()
    const store = CorrelationContext.getStore();
    assert.deepEqual(store, {});
  });

  it('retorna null para correlationId fora de contexto', () => {
    assert.equal(CorrelationContext.correlationId, null);
    assert.equal(CorrelationContext.traceId,       null);
  });

  it('isola contextos concorrentes', async () => {
    const resultados = await Promise.all([
      new Promise(resolve => {
        CorrelationContext.run({ correlationId: 'c1' }, () => {
          // Simula trabalho async
          resolve(CorrelationContext.correlationId);
        });
      }),
      new Promise(resolve => {
        CorrelationContext.run({ correlationId: 'c2' }, () => {
          resolve(CorrelationContext.correlationId);
        });
      }),
    ]);
    assert.equal(resultados[0], 'c1');
    assert.equal(resultados[1], 'c2');
  });

  it('setUserId atualiza o store existente', () => {
    CorrelationContext.run({}, () => {
      CorrelationContext.setUserId('user-xyz');
      assert.equal(CorrelationContext.userId, 'user-xyz');
    });
  });

  it('setUserId fora de contexto não lança erro', () => {
    assert.doesNotThrow(() => CorrelationContext.setUserId('u'));
  });
});

// ─── ObservabilityMiddleware ──────────────────────────────────────

describe('ObservabilityMiddleware', () => {
  it('propaga x-correlation-id do request para o response', () => {
    const { req, res, next } = fakeMock({ headers: { 'x-correlation-id': 'client-cid' } });

    ObservabilityMiddleware.handle(req, res, next);

    assert.equal(res._headers['x-correlation-id'], 'client-cid');
    assert.equal(next.calls.length, 1, 'next() deve ser chamado');
  });

  it('gera x-correlation-id quando ausente no request', () => {
    const { req, res, next } = fakeMock();

    ObservabilityMiddleware.handle(req, res, next);

    assert.ok(res._headers['x-correlation-id'], 'deve gerar correlationId');
    assert.ok(res._headers['x-trace-id'],       'deve gerar traceId');
    assert.ok(res._headers['x-request-id'],     'deve gerar requestId');
  });

  it('extrai traceId de header traceparent W3C', () => {
    const traceId    = 'a'.repeat(32);
    const spanId     = 'b'.repeat(16);
    const traceparent = `00-${traceId}-${spanId}-01`;

    const { req, res, next } = fakeMock({ headers: { traceparent } });

    ObservabilityMiddleware.handle(req, res, next);

    assert.equal(res._headers['x-trace-id'], traceId);
  });

  it('ignora traceparent malformado e gera novo traceId', () => {
    const { req, res, next } = fakeMock({ headers: { traceparent: 'invalido' } });

    ObservabilityMiddleware.handle(req, res, next);

    assert.ok(res._headers['x-trace-id'], 'deve gerar traceId fallback');
  });

  it('disponibiliza correlationId via CorrelationContext dentro do next()', () => {
    const { req, res } = fakeMock({ headers: { 'x-correlation-id': 'cid-test' } });
    let cidDentro;

    ObservabilityMiddleware.handle(req, res, () => {
      cidDentro = CorrelationContext.correlationId;
    });

    assert.equal(cidDentro, 'cid-test');
  });
});

// ─── Campos obrigatórios do store (snapshot) ──────────────────────

describe('Campos obrigatórios do CorrelationContext', () => {
  it('store possui todos os campos obrigatórios', () => {
    const CAMPOS_OBRIGATORIOS = ['correlationId', 'traceId', 'requestId', 'userId'];

    CorrelationContext.run({}, () => {
      const store = CorrelationContext.getStore();
      for (const campo of CAMPOS_OBRIGATORIOS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(store, campo),
          `store deve ter campo "${campo}"`,
        );
      }
    });
  });

  it('store inicial tem userId null', () => {
    CorrelationContext.run({}, () => {
      assert.equal(CorrelationContext.getStore().userId, null);
    });
  });
});
