'use strict';

const { Metrics } = require('./Metrics');

/**
 * MetricsMiddleware — Middleware Express para registro de métricas RED por endpoint.
 *
 * Normaliza rotas para evitar explosão de cardinalidade no Prometheus:
 *   /api/v1/barbearias/550e8400-... → /api/v1/barbearias/:id
 *   /api/v1/clientes/42            → /api/v1/clientes/:id
 *
 * Uso em app.js (registrar antes das rotas, após ObservabilityMiddleware):
 *   app.use(MetricsMiddleware.handle);
 *   app.get('/metrics', MetricsMiddleware.metricsHandler());
 */
class MetricsMiddleware {
  /** Substitui IDs dinâmicos (UUID ou numéricos) na URL por :id */
  static #ID_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/\d+/gi;

  /**
   * Retorna a rota normalizada para uso como label Prometheus.
   * Prioriza o padrão do Express (req.route.path) para precisão máxima.
   * @param {import('express').Request} req
   * @returns {string}
   */
  static #normalizeRoute(req) {
    if (req.route?.path) {
      return `${req.baseUrl ?? ''}${req.route.path}`;
    }
    return req.path.replace(MetricsMiddleware.#ID_RE, '/:id');
  }

  /**
   * Express middleware que mede duração e registra métricas RED após response.
   * @type {import('express').RequestHandler}
   */
  static handle(req, res, next) {
    if (!Metrics.isEnabled) return next();

    const startMs = Date.now();

    res.on('finish', () => {
      const route    = MetricsMiddleware.#normalizeRoute(req);
      const duration = Date.now() - startMs;
      Metrics.recordHttp(req.method, route, res.statusCode, duration);
    });

    next();
  }

  /**
   * Handler Express que expõe o endpoint /metrics para scraping pelo Prometheus.
   * Deve ser protegido por rede (não expor publicamente em produção).
   * @returns {import('express').RequestHandler}
   */
  static metricsHandler() {
    return async (_req, res) => {
      if (!Metrics.isEnabled) {
        return res.status(503).send('Metrics not available');
      }
      const text = await Metrics.metricsText();
      res.setHeader('Content-Type', Metrics.contentType);
      res.status(200).send(text);
    };
  }
}

module.exports = { MetricsMiddleware };
