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

module.exports = criarApp();
