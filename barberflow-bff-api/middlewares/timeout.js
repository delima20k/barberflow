'use strict';

const { logger } = require('./logger');
const config     = require('../config');

/**
 * TimeoutMiddleware — Aborta requisições que excedem o limite de tempo.
 *
 * Previne que queries lentas segurem conexões indefinidamente.
 * Padrão: 30s (configurável via REQUEST_TIMEOUT_MS env → config.timeoutMs).
 */
class TimeoutMiddleware {

  /**
   * @type {import('express').RequestHandler}
   */
  static handle(req, res, next) {
    const timeoutMs = config.timeoutMs;
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      logger.warn(
        { method: req.method, path: req.path, timeoutMs },
        '[BFF] Request timeout',
      );
      res.status(503).json({ ok: false, error: 'Serviço temporariamente indisponível (timeout).' });
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timer));
    res.on('close',  () => clearTimeout(timer));
    next();
  }
}

module.exports = TimeoutMiddleware;
