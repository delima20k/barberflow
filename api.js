'use strict';

// =============================================================
// api.js — Ponto de entrada do servidor de API BarberFlow.
//
// Responsabilidades:
//   1. Carregar variáveis de ambiente
//   2. Suporte a cluster (1 worker por CPU) em produção
//   3. Graceful shutdown: aguarda requests ativos antes de fechar
//
// Uso:
//   node api.js
//   PORT=3001 APP_ENV=production node api.js
// =============================================================

require('dotenv').config();

const cluster = require('node:cluster');
const os      = require('node:os');

const IS_PROD    = process.env.APP_ENV === 'production';
const NUM_CPUS   = os.cpus().length;
const PORT       = parseInt(process.env.PORT ?? '3001', 10);

// ── Cluster: primary distribui carga entre workers ────────────
if (IS_PROD && cluster.isPrimary) {
  const logger = require('./src/infra/LoggerService');
  logger.info({ workers: NUM_CPUS, port: PORT }, '[BarberFlow API] Iniciando cluster');

  for (let i = 0; i < NUM_CPUS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code) => {
    logger.warn({ pid: worker.process.pid, code }, '[BarberFlow API] Worker encerrado — reiniciando');
    cluster.fork(); // Auto-restart em produção
  });

  return; // Primary não sobe servidor HTTP
}

// ── Worker (ou processo único em desenvolvimento) ──────────────
const criarApp = require('./src/app');
const logger   = require('./src/infra/LoggerService');

const app    = criarApp();
const server = app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.APP_ENV ?? 'development';
  logger.info({ port: PORT, env, pid: process.pid }, '[BarberFlow API] Servidor iniciado');
});

// ── Graceful shutdown ─────────────────────────────────────────
// Aguarda requests em andamento antes de fechar.
// Kubernetes/Vercel/PM2 enviam SIGTERM antes de encerrar o processo.

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);

function gracefulShutdown(signal) {
  logger.info({ signal }, '[BarberFlow API] Sinal de encerramento recebido — aguardando requests');

  server.close((err) => {
    if (err) {
      logger.error({ err }, '[BarberFlow API] Erro ao fechar servidor');
      process.exit(1);
    }
    logger.info('[BarberFlow API] Servidor encerrado com sucesso');
    process.exit(0);
  });

  // Força encerramento se requests demorarem demais
  setTimeout(() => {
    logger.warn('[BarberFlow API] Timeout de shutdown — forçando encerramento');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Captura erros não tratados — evita crash silencioso
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[BarberFlow API] Exceção não tratada — encerrando');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, '[BarberFlow API] Promise rejeitada não tratada — encerrando');
  process.exit(1);
});

