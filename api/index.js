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

// Na Vercel as env vars já estão injetadas — não precisa de dotenv.
// Importa o Express app diretamente, evitando o api.js (que carrega dotenv para dev local).
const criarApp = require('../src/app');
module.exports = criarApp();
