'use strict';

// =============================================================
// api/index.js — Ponto de entrada Vercel (Lambda serverless).
//
// O Vercel detecta automaticamente arquivos em /api/ como funções
// serverless. Este arquivo expõe o Express app para que o Vercel
// possa invocá-lo a cada request recebida.
//
// Para desenvolvimento local / PM2 / Docker, use o arquivo raiz:
//   node api.js
// =============================================================

module.exports = require('../api');
