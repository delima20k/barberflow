'use strict';

// =============================================================
// api.js — Ponto de entrada do servidor de API BarberFlow.
//
// Processo único e stateless — sem node:cluster.
// A escala horizontal é responsabilidade do orquestrador externo:
//   - PM2:        ecosystem.config.js  (fork mode, N instâncias)
//   - Docker:     Dockerfile + réplicas
//   - Kubernetes: Deployment com replicas + HPA
//
// Cada instância é completamente independente:
//   - Sem memória compartilhada entre processos
//   - Sem sessão armazenada em processo
//   - Sem IPC entre workers
//
// Uso:
//   node api.js                        (desenvolvimento)
//   pm2 start ecosystem.config.js      (produção via PM2)
//   docker run barberflow-api          (produção via Docker)
// =============================================================

// Na Vercel as variáveis já estão em process.env — dotenv só é necessário localmente.
// O eval() impede o bundler (@vercel/nft) de incluir dotenv no bundle serverless.
if (!process.env.VERCEL) {
  // eslint-disable-next-line no-eval
  eval("require('dotenv').config()");
}

const criarApp = require('./src/app');
const logger   = require('./src/infra/LoggerService');

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = criarApp();

// ── Vercel serverless ─────────────────────────────────────────
// O Vercel usa @vercel/node para empacotar este arquivo como uma
// Lambda. A função exportada é chamada diretamente para cada
// request — app.listen() não é invocado nesse contexto.
module.exports = app;

// ── Local / Docker / PM2 ──────────────────────────────────────
// Quando executado diretamente (node api.js), inicia o servidor
// HTTP e registra os handlers de shutdown graceful.
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(
      { port: PORT, env: process.env.APP_ENV ?? 'development', pid: process.pid },
      '[BarberFlow API] Servidor iniciado',
    );
  });

  // PM2, Kubernetes e Docker enviam SIGTERM antes de encerrar.
  // Aguardamos requests ativos antes de fechar — zero downtime deploy.
  const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);

  function gracefulShutdown(signal) {
    logger.info({ signal }, '[BarberFlow API] Encerrando — aguardando requests ativos');

    server.close((err) => {
      if (err) {
        logger.error({ err }, '[BarberFlow API] Erro ao fechar servidor');
        process.exit(1);
      }
      logger.info('[BarberFlow API] Encerrado com sucesso');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('[BarberFlow API] Timeout de shutdown — forçando encerramento');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[BarberFlow API] Exceção não tratada — encerrando');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, '[BarberFlow API] Promise rejeitada não tratada — encerrando');
    process.exit(1);
  });
}

