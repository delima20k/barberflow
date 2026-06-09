'use strict';

const { randomUUID } = require('node:crypto');

const { CorrelationContext } = require('./CorrelationContext');

/**
 * ObservabilityMiddleware — Middleware Express que inicializa o CorrelationContext
 * para cada request HTTP.
 *
 * Responsabilidades:
 *   - Extrai ou gera correlationId (header X-Correlation-ID)
 *   - Extrai traceId do header traceparent (W3C Trace Context)
 *   - Injeta x-correlation-id, x-trace-id, x-request-id na resposta
 *   - Executa next() dentro do contexto isolado via AsyncLocalStorage
 *
 * Ordem: deve ser registrado antes de qualquer rota ou middleware que precise
 * de correlação (antes do logger HTTP e das rotas de negócio).
 */
class ObservabilityMiddleware {
  /** Regex W3C traceparent: version-traceId(32)-spanId(16)-flags(2) */
  static #TRACE_PARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

  /**
   * Parseia header traceparent no formato W3C.
   * @param {string|undefined} header
   * @returns {{ traceId: string, parentSpanId: string, flags: string }|null}
   */
  static #parseTraceparent(header) {
    if (!header) return null;
    const m = ObservabilityMiddleware.#TRACE_PARENT_RE.exec(header);
    if (!m) return null;
    return { traceId: m[1], parentSpanId: m[2], flags: m[3] };
  }

  /**
   * Express middleware.
   * @param {import('express').Request}  req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  static handle(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
    const requestId     = req.headers['x-request-id']     ?? randomUUID();

    const tp      = ObservabilityMiddleware.#parseTraceparent(req.headers['traceparent']);
    const traceId = tp?.traceId ?? randomUUID().replace(/-/g, '');
    const diagnosticsEnabled = req.headers['x-load-test'] === 'barberflow'
      || req.headers['x-bff-diagnostics'] === 'barberflow';

    // Propaga para o cliente — permite correlacionar logs/traces de ponta a ponta
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-trace-id',       traceId);
    res.setHeader('x-request-id',     requestId);

    CorrelationContext.run({
      correlationId,
      traceId,
      requestId,
      diagnostics: diagnosticsEnabled
        ? {
            enabled: true,
            endpoint: `${req.method} ${req.path}`,
            timings: [],
          }
        : null,
    }, next);
  }
}

module.exports = { ObservabilityMiddleware };
