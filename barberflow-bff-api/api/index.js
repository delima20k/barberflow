'use strict';

// ================================================================
// api/index.js — Adapter Vercel Serverless para o BFF BarberFlow.
//
// Responsabilidade única: exportar a instância Express configurada
// para que a Vercel injete req/res sem precisar de app.listen().
//
// Uso local: server.js (continua com app.listen() para dev/staging).
// Uso Vercel: este arquivo (exporta o app, Vercel gerencia o servidor).
// ================================================================

const criarApp = require('../app');

// ── Bootstrap logging (stdout estruturado — visível nos logs da Vercel) ──
const _meta = {
  startedAt:   new Date().toISOString(),
  nodeVersion: process.version,
  env:         process.env.APP_ENV ?? process.env.NODE_ENV ?? 'production',
  vercel:      !!process.env.VERCEL,
  region:      process.env.VERCEL_REGION ?? 'unknown',
};
process.stdout.write(JSON.stringify({ level: 'info', msg: '[BFF] Inicializando', ..._meta }) + '\n');

let _app;
try {
  _app = criarApp();
  process.stdout.write(JSON.stringify({ level: 'info', msg: '[BFF] App criado com sucesso', ..._meta }) + '\n');
} catch (err) {
  process.stderr.write(JSON.stringify({
    level: 'fatal',
    msg:   '[BFF] Falha crítica ao criar app — deploy com erro',
    err:   { message: err.message, stack: err.stack },
    ..._meta,
  }) + '\n');
  throw err;
}

module.exports = _app;
