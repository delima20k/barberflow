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
   * Injeta o header X-Response-Time (ms) antes de cada resposta.
   * @type {import('express').RequestHandler}
   */
  static responseTime(req, res, next) {
    const start   = process.hrtime.bigint();
    const origEnd = res.end.bind(res);
    res.end = function (...args) {
      if (!res.headersSent) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
      }
      return origEnd(...args);
    };
    next();
  }

  /**
   * @type {import('express').RequestHandler}
   */
  static handle(req, res, next) {
    const timeoutMs = TimeoutMiddleware.#timeoutFor(req);
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

  static #timeoutFor(req) {
    const originalUrl = String(req.originalUrl ?? req.url ?? '');
    if (originalUrl.includes('/media/stories/upload-compressed')) {
      const mediaTimeout = Number(process.env.STORY_VIDEO_UPLOAD_TIMEOUT_MS ?? 55_000);
      return Math.min(Math.max(mediaTimeout, config.timeoutMs), 55_000);
    }
    return config.timeoutMs;
  }
}

module.exports = TimeoutMiddleware;
