'use strict';

// =============================================================
// api.js — Ponto de entrada do servidor de API BarberFlow.
//
// Carrega variáveis de ambiente (.env), instancia o app Express
// e inicia o servidor na porta configurada.
//
// Uso:
//   node api.js
//   PORT=3001 node api.js
// =============================================================

require('dotenv').config();

const criarApp = require('./src/app');

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = criarApp();

app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.APP_ENV ?? 'development';
  console.log(`[BarberFlow API] Servidor iniciado — porta ${PORT} — ${env}`);
  console.log(`[BarberFlow API] Health check: http://localhost:${PORT}/api/health`);
});
