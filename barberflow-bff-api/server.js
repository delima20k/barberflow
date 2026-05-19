'use strict';

// ================================================================
// server.js — Ponto de entrada do BFF BarberFlow.
//
// Modo serverless (VERCEL=1):
//   Exporta wrapper Express com CORS-first e lazy-init.
//   Garante que Access-Control-Allow-Origin seja enviado mesmo
//   que criarApp() falhe — retorna 503 com CORS headers corretos.
//
// Modo local / Docker / PM2 (!VERCEL):
//   Eager init (fail-fast) + listen() + graceful shutdown.
// ================================================================

// Carrega .env localmente (Vercel/Railway/Render injetam no processo).
if (!process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT) {
  try { require('dotenv').config(); } catch { /* dotenv opcional */ }
}

const express        = require('express');
const CorsMiddleware = require('./middlewares/cors');

// Lazy-init: adia criarApp() para a primeira requisição.
// Garante que CorsMiddleware.handle sempre execute primeiro —
// inclusive em OPTIONS preflight — mesmo que criarApp() falhe.
let _app;

const wrapper = express();
wrapper.use(CorsMiddleware.handle);

wrapper.use((req, res, next) => {
  if (!_app) {
    try {
      _app = require('./app')();
    } catch {
      return res.status(503).json({ ok: false, error: 'Service unavailable' });
    }
  }
  _app(req, res, next);
});

// Exporta para Vercel serverless: module.exports deve ser o handler Express.
module.exports = wrapper;

// ── Modo local / Docker / PM2 ────────────────────────────────────
if (!process.env.VERCEL) {
  const config     = require('./config');
  const { logger } = require('./middlewares/logger');

  // Eager init: falha rápido em desenvolvimento se app não inicializar.
  try {
    _app = require('./app')();
  } catch (err) {
    // logger pode não estar disponível se a falha for muito precoce.
    // eslint-disable-next-line no-console
    console.error('[BFF] Falha ao inicializar app — encerrando:', err);
    process.exit(1);
  }

  const server = wrapper.listen(config.port, '0.0.0.0', () => {
    logger.info(
      { port: config.port, env: config.env, pid: process.pid },
      '[BFF BarberFlow] Servidor iniciado',
    );
  });

  function gracefulShutdown(signal) {
    logger.info({ signal }, '[BFF BarberFlow] Encerrando — aguardando requests ativos');

    server.close((err) => {
      if (err) {
        logger.error({ err }, '[BFF BarberFlow] Erro ao fechar servidor');
        process.exit(1);
      }
      logger.info('[BFF BarberFlow] Encerrado com sucesso');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('[BFF BarberFlow] Timeout de shutdown — forçando encerramento');
      process.exit(1);
    }, config.shutdownTimeoutMs).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException',  (err) => {
    logger.fatal({ err }, '[BFF BarberFlow] Exceção não tratada — encerrando');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, '[BFF BarberFlow] Promise rejeitada não tratada — encerrando');
    process.exit(1);
  });
}
