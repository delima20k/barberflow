'use strict';

// ================================================================
// server.js — Ponto de entrada do BFF BarberFlow.
//
// Responsabilidade única: inicializar o servidor HTTP,
// registrar handlers de shutdown graceful e tratar exceções.
//
// NÃO exporta o app (isso é responsabilidade de app.js).
// ================================================================

// Carrega .env localmente (Vercel/Railway/Render injetam no processo).
if (!process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT) {
  try { require('dotenv').config(); } catch { /* dotenv opcional */ }
}

const criarApp   = require('./app');
const config     = require('./config');
const { logger } = require('./middlewares/logger');

const app    = criarApp();
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(
    { port: config.port, env: config.env, pid: process.pid },
    '[BFF BarberFlow] Servidor iniciado',
  );
});

// ── Shutdown graceful ────────────────────────────────────────────

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

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[BFF BarberFlow] Exceção não tratada — encerrando');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, '[BFF BarberFlow] Promise rejeitada não tratada — encerrando');
  process.exit(1);
});
