'use strict';

// ================================================================
// app.js — Express factory do BFF BarberFlow.
//
// Responsabilidade única: montar e configurar o app Express.
// Não inicia o servidor (isso cabe ao server.js).
//
// Ordem dos middlewares:
//   1. CORS           — antes de tudo (trata preflight OPTIONS)
//   2. Helmet         — headers de segurança OWASP
//   3. Compression    — gzip
//   4. Logger HTTP    — pino-http
//   5. Rate limit     — geral + escrita
//   6. Timeout        — 30s padrão
//   7. Body parser    — JSON (50kb)
//   8. Rotas v1       — /api/v1/*
//   9. Auth           — /api/auth/*
//  10. Agendamentos   — /api/agendamentos/*
//  11. Health legado  — /api/health (compatibilidade com monitoramento)
//  12. 404 handler
//  13. Error handler global
// ================================================================

const express    = require('express');
const helmet     = require('helmet');
const compression = require('compression');

const CorsMiddleware        = require('./middlewares/cors');
const { loggerMiddleware }  = require('./middlewares/logger');
const RateLimiterMiddleware = require('./middlewares/rateLimiter');
const TimeoutMiddleware     = require('./middlewares/timeout');
const ErrorHandler          = require('./middlewares/errorHandler');
const healthRoute           = require('./routes/health');
const barbeariaRoute        = require('./routes/barbearias');
const clienteRoute          = require('./routes/clientes');
const clienteBffRoute       = require('./routes/clienteBff');
const authRoute             = require('./routes/auth');
const agendamentosRoute     = require('./routes/agendamentos');

function criarApp() {
  const app = express();

  // ── 1. CORS ──────────────────────────────────────────────────
  app.use(CorsMiddleware.handle);

  // ── 2. Helmet (headers OWASP) ────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy:   false,
  }));

  // ── 3. Compression ───────────────────────────────────────────
  app.use(compression());

  // ── 4. Logger HTTP ───────────────────────────────────────────
  app.use(loggerMiddleware);

  // ── 5. Rate limiting ─────────────────────────────────────────
  app.use('/api/', RateLimiterMiddleware.geral);
  app.use('/api/', RateLimiterMiddleware.escrita);

  // ── 6. Timeout ───────────────────────────────────────────────
  app.use(TimeoutMiddleware.handle);

  // ── 7. Body parser JSON ──────────────────────────────────────
  app.use(express.json({ limit: '50kb' }));

  // ── 8. Rotas v1 ──────────────────────────────────────────────
  const v1Router = express.Router();
  v1Router.use('/health',     healthRoute);
  v1Router.use('/barbearias', barbeariaRoute);
  v1Router.use('/clientes',   clienteRoute);
  v1Router.use('/cliente',    clienteBffRoute);
  app.use('/api/v1', v1Router);

  // ── 9. Auth — /api/auth/* ───────────────────────────────────────
  // Namespace separado (não versionado) para login, logout, refresh e me.
  app.use('/api/auth', authRoute);

  // ── 10. Agendamentos — /api/agendamentos/* ───────────────────────
  app.use('/api/agendamentos', agendamentosRoute);

  // ── 11. Health check legado (/api/health) ────────────────────────
  // Mantém compatibilidade com sistemas de monitoramento existentes.
  app.use('/api/health', healthRoute);

  // ── 12. 404 ──────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  // ── 13. Error handler global ─────────────────────────────────
  app.use(ErrorHandler.handle);

  return app;
}

module.exports = criarApp;
