'use strict';

if (!process.env.VERCEL) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* opcional */ }
}

const express        = require('express');
const CorsMiddleware = require('../middlewares/cors');

// Lazy init: adia criarApp() para a primeira requisição real.
// Garante que CorsMiddleware.handle execute SEMPRE — inclusive no
// preflight OPTIONS — mesmo que criarApp() venha a falhar.
let _app;

const wrapper = express();
wrapper.use(CorsMiddleware.handle);

wrapper.use((req, res, next) => {
  if (!_app) {
    try {
      _app = require('../app')();
    } catch {
      return res.status(503).json({ ok: false, error: 'Service unavailable' });
    }
  }
  _app(req, res, next);
});

module.exports = wrapper;
