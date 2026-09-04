'use strict';

// Vercel serverless entry point — exporta Express app sem chamar listen().
if (!process.env.VERCEL) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* opcional */ }
}

const criarWrapperHttp = require('../httpWrapper');

// Lazy init: a fábrica só é exigida na primeira requisição real, e o
// CorsMiddleware roda SEMPRE antes dela — inclusive no preflight OPTIONS
// e quando criarApp() falha (503 com a causa).
module.exports = criarWrapperHttp(() => require('../app')());
