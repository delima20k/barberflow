'use strict';

// ================================================================
// httpWrapper.js — wrapper HTTP compartilhado do BFF.
//
// Recebe a fábrica do app por parâmetro (nunca a importa), para que
// app.js e api/index.js possam usá-lo sem criar dependência circular
// — um ciclo aqui quebra o bundle da Vercel (esbuild), com erro do
// tipo "require_app$1 is not a function" em toda requisição.
//
// Garante que o CORS rode SEMPRE, inclusive no preflight OPTIONS e
// quando a construção do app falha (devolve 503 com a causa real).
// ================================================================

const express        = require('express');
const CorsMiddleware = require('./middlewares/cors');

/**
 * @param {() => import('express').Express} criarAppFn
 * @returns {import('express').Express}
 */
function criarWrapperHttp(criarAppFn) {
  const wrapper = express();
  wrapper.use(CorsMiddleware.handle);

  let _app;
  wrapper.use((req, res, next) => {
    if (!_app) {
      try {
        _app = criarAppFn();
      } catch (err) {
        // Loga a causa real do boot — sem stack/secrets, apenas a mensagem.
        // eslint-disable-next-line no-console
        console.error('[BFF] criarApp() falhou no boot:', err?.message ?? err);
        return res.status(503).json({
          ok: false,
          error: 'Service unavailable',
          reason: err?.message ?? String(err),
        });
      }
    }
    _app(req, res, next);
  });

  return wrapper;
}

module.exports = criarWrapperHttp;
