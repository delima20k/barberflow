'use strict';

// =============================================================
// RequestTimeoutMiddleware.js — Timeout por requisição.
// Camada: infra
//
// Aborta requisições que demoram mais que o limite configurado.
// Sem isso, uma query lenta segura a conexão para sempre e
// esgota o pool de conexões com o banco.
//
// Padrão: 30s (TIMEOUT_MS env var ou REQUEST_TIMEOUT_MS)
// =============================================================

const logger = require('./LoggerService');

const TIMEOUT_MS = parseInt(
  process.env.REQUEST_TIMEOUT_MS ?? process.env.TIMEOUT_MS ?? '30000',
  10,
);

/**
 * Middleware de timeout por requisição.
 * Responde 503 se a rota não responder dentro do limite.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestTimeout(req, res, next) {
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    logger.warn({ method: req.method, path: req.path, timeoutMs: TIMEOUT_MS }, 'Request timeout');
    res.status(503).json({ ok: false, error: 'Serviço temporariamente indisponível (timeout).' });
  }, TIMEOUT_MS);

  // Limpa o timer assim que a resposta for enviada
  res.on('finish', () => clearTimeout(timer));
  res.on('close',  () => clearTimeout(timer));

  next();
}

module.exports = requestTimeout;
