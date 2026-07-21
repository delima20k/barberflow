'use strict';

// ================================================================
// app.js — Express factory do BFF BarberFlow.
//
// Responsabilidade única: montar e configurar o app Express.
// Não inicia o servidor (isso cabe ao server.js).
//
// Ordem dos middlewares:
//   1. CORS                — antes de tudo (trata preflight OPTIONS)
//   2. ObservabilityMW     — correlationId/traceId (AsyncLocalStorage)
//   3. Helmet              — headers de segurança OWASP
//   4. Compression         — gzip
//   5. Logger HTTP         — pino-http enriquecido com correlationId
//   6. MetricsMW           — RED metrics por endpoint (Prometheus)
//   7. Rate limit          — geral + escrita
//   8. Timeout             — 30s padrão
//   9. Body parser         — JSON (50kb)
//  10. Rotas v1            — /api/v1/*
//  11. Auth                — /api/auth/*
//  12. Agendamentos        — /api/agendamentos/*
//  13. Health legado       — /api/health (compatibilidade)
//  14. /metrics            — Prometheus scraping (rede interna)
//  15. 404 handler
//  16. Error handler global
// ================================================================

const express    = require('express');
const helmet     = require('helmet');
const compression = require('compression');

const CorsMiddleware        = require('./middlewares/cors');
const { loggerMiddleware }  = require('./middlewares/logger');
const RateLimiterMiddleware = require('./middlewares/rateLimiter');
const TimeoutMiddleware     = require('./middlewares/timeout');
const ErrorHandler          = require('./middlewares/errorHandler');
const { AbuseMiddleware }   = require('./middlewares/abuse/AbuseMiddleware');

const { ObservabilityMiddleware } = require('./observability/ObservabilityMiddleware');
const { MetricsMiddleware }       = require('./observability/MetricsMiddleware');
const { Metrics }                 = require('./observability/Metrics');
const { SentryClient }            = require('./observability/SentryClient');
const RequestDiagnosticsMiddleware = require('./observability/RequestDiagnosticsMiddleware');

const healthRoute    = require('./routes/health');
const healthzRoute   = require('./routes/healthz');
const barbeariaRoute = require('./routes/barbearias');
const profissionalRoute = require('./routes/profissionais');
const clienteRoute   = require('./routes/clientes');
const clienteBffRoute = require('./routes/clienteBff');
const authRoute             = require('./routes/auth');
const agendamentosRoute     = require('./routes/agendamentos');
const notificacoesRoute     = require('./routes/notificacoes');
const mensalistasRoute      = require('./routes/mensalistas');
const financeiroRoute       = require('./routes/financeiro');
const professionalPaymentsRoute = require('./routes/professionalPayments');
const professionalVouchersRoute = require('./routes/professionalVouchers');
const geoRoute              = require('./routes/geo');
const mediaRoute            = require('./routes/media');
const feedRoute             = require('./routes/feed');
const chatRoute             = require('./routes/chat');
const schedulerRoute        = require('./routes/scheduler');
const conviteProRoute       = require('./routes/convites-pro');
const p2pRoute              = require('./routes/p2p');
const adminConfigRoute      = require('./routes/adminConfig');
const adminRoute            = require('./routes/admin');
const internalCronRoute     = require('./routes/internalCron');
const shareRoute            = require('./routes/share');
const { LandingRouteFactory } = require('./routes/landing');
const SupabaseClient         = require('./utils/SupabaseClient');
const { R2ConfigService }    = require('./application/admin/R2ConfigService');

/**
 * Valida variáveis de ambiente obrigatórias no startup.
 * Falha cedo com mensagem clara em vez de 500 no primeiro request.
 * Pulado em ambiente de teste (APP_ENV=test) para não quebrar a suite.
 */
function _validarEnv() {
  if (process.env.APP_ENV === 'test') return;
  const ausentes = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']
    .filter(k => !process.env[k]);
  if (ausentes.length > 0) {
    throw new Error(`[BFF] Variáveis obrigatórias ausentes: ${ausentes.join(', ')}`);
  }
}

function criarApp(db = null) {
  _validarEnv();
  const _db = db ?? SupabaseClient.getInstance();

  // Inicializa sistemas de observabilidade (idempotente)
  Metrics.init();
  SentryClient.init();

  // Carrega configurações de storage do banco e injeta em process.env.
  // Execução não-bloqueante: falha silenciosa para não impedir o startup.
  if (process.env.APP_ENV !== 'test') {
    try {
      new R2ConfigService(_db).patchProcessEnv().catch(err => {
        console.warn('[startup] patchProcessEnv falhou (continua):', err?.message ?? err);
      });
    } catch (err) {
      console.warn('[startup] R2ConfigService init falhou (continua):', err?.message ?? err);
    }
  }

  const app = express();

  // Confia no primeiro proxy da cadeia (Vercel/CDN) para que req.ip
  // reflita o IP real do cliente — necessário para rate limiting eficaz.
  app.set('trust proxy', 1);

  // ── 1. CORS ──────────────────────────────────────────────────
  app.use(CorsMiddleware.handle);

  // ── 2. ObservabilityMiddleware ───────────────────────────────
  // Deve vir ANTES do logger HTTP para enriquecer logs com correlationId.
  app.use(ObservabilityMiddleware.handle);
  app.use(RequestDiagnosticsMiddleware.initAppointment);
  app.use(RequestDiagnosticsMiddleware.initChat);

  // ── 3. Helmet (headers OWASP) ────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ── 4. Compression ───────────────────────────────────────────
  app.use(compression());

  // ── 5. Logger HTTP + Response-Time ──────────────────────────
  app.use(loggerMiddleware);
  app.use(TimeoutMiddleware.responseTime);

  // ── 6. Métricas RED Prometheus ───────────────────────────────
  app.use(MetricsMiddleware.handle);

  // ── 7. Rate limiting ─────────────────────────────────────────
  app.use('/api/', RequestDiagnosticsMiddleware.measure('rate_limit_general', RateLimiterMiddleware.geral));
  app.use('/api/', RequestDiagnosticsMiddleware.measure('rate_limit_write', RateLimiterMiddleware.escrita));

  // ── 8. Timeout ───────────────────────────────────────────────
  app.use(TimeoutMiddleware.handle);

  // ── 9. Body parser JSON ──────────────────────────────────────
  app.use(express.json({ limit: '50kb' }));

  // ── 10. Rotas v1 ──────────────────────────────────────────────
  const v1Router = express.Router();
  v1Router.use('/health',        healthRoute);
  v1Router.use('/barbearias',    barbeariaRoute(_db));
  v1Router.use('/profissionais',  profissionalRoute(_db));
  v1Router.use('/clientes',      clienteRoute(_db));
  v1Router.use('/cliente',       clienteBffRoute);
  v1Router.use('/notificacoes',  notificacoesRoute);
  v1Router.use('/mensalistas',   mensalistasRoute(_db));
  v1Router.use('/financeiro',     financeiroRoute(_db));
  v1Router.use('/profissional/pagamentos', professionalPaymentsRoute(_db));
  v1Router.use('/professional-vouchers', professionalVouchersRoute(_db));
  v1Router.use('/landing',       LandingRouteFactory.create());
  v1Router.use('/auth', RateLimiterMiddleware.auth, AbuseMiddleware.forHttp(), authRoute);
  v1Router.use('/geo',           geoRoute);
  v1Router.use('/media',         AbuseMiddleware.forHttp(), mediaRoute(_db));
  v1Router.use('/feed',          AbuseMiddleware.forHttp(), feedRoute(_db));
  v1Router.use('/chat',          AbuseMiddleware.forHttp(), chatRoute(_db));
  v1Router.use('/scheduler',     schedulerRoute(_db));
  v1Router.use('/profissionais', conviteProRoute(_db));
  v1Router.use('/admin/config', adminConfigRoute(_db));
  app.use('/api/v1', v1Router);

  // ── Reset pontual de curtidas (ONE-TIME, protegido por RESET_LIKES_KEY) ─────
  // Uso: POST /api/v1/admin/reset-likes com header X-Reset-Key: <RESET_LIKES_KEY>
  // Após usar: remova RESET_LIKES_KEY do env para desabilitar.
  v1Router.post('/admin/reset-likes', async (req, res) => {
    const key = process.env.RESET_LIKES_KEY;
    if (!key || req.headers['x-reset-key'] !== key) {
      return res.status(401).json({ ok: false, error: 'Nao autorizado.' });
    }
    try {
      await _db.from('likes').delete().eq('content_type', 'portfolio_image');
      await _db.from('portfolio_images').update({ likes_count: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
      return res.json({ ok: true, message: 'Curtidas zeradas com sucesso.' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message ?? 'Erro ao resetar.' });
    }
  });

  // ── Admin dashboard — /api/v1/admin/* ─────────────────────────
  // Registrado após reset-likes para que aquele handler específico
  // seja avaliado primeiro pelo roteador v1.
  v1Router.use('/admin', adminRoute(_db));

  // Compatibilidade com MediaP2P legado ate todos os clients apontarem para /api/v1.
  app.use('/api/media', mediaRoute(_db));

  // ── Cron interno — exclusivo para Vercel Cron Jobs ───────────
  // Validado por Authorization: Bearer $CRON_SECRET (injetado pelo Vercel).
  app.use('/api/internal/cron', internalCronRoute(_db));

  // ── P2P ICE config ────────────────────────────────────────────
  app.use('/api/p2p', p2pRoute());

  // ── Compartilhamento público (Open Graph) — /b/:id ───────────
  // Fora de /api: sem auth, sem rate-limit de JSON. Serve HTML com meta
  // tags p/ preview rico (WhatsApp) e redireciona para a SPA da barbearia.
  app.use('/b', shareRoute(_db));

  // ── 11. Auth — /api/auth/* ───────────────────────────────────
  app.use('/api/auth', RateLimiterMiddleware.auth);
  app.use('/api/auth', AbuseMiddleware.forHttp());
  app.use('/api/auth', authRoute);

  // ── 12. Agendamentos — /api/agendamentos/* ───────────────────
  app.use('/api/agendamentos', RequestDiagnosticsMiddleware.measure('abuse_rate_limit', AbuseMiddleware.forHttp()));
  app.use('/api/agendamentos', agendamentosRoute);

  // ── 13. Health checks ────────────────────────────────────────
  // /health/live  → liveness (sempre 200 se o processo responde)
  // /health/ready → readiness com checks reais de Supabase + Redis
  app.use('/health', healthzRoute({ supabase: _db }));

  // Compatibilidade com monitoramento existente
  app.use('/api/health', healthRoute);

  // ── 14. /metrics — Prometheus scraping ───────────────────────
  // Protegido por Bearer token em produção (METRICS_TOKEN env var).
  // Em dev/test, acessível sem token para facilitar debug local.
  const _metricsGuard = (req, res, next) => {
    const token = process.env.METRICS_TOKEN;
    if (!token || process.env.APP_ENV !== 'production') return next();
    if (req.headers['authorization'] === `Bearer ${token}`) return next();
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  };
  app.get('/metrics', _metricsGuard, MetricsMiddleware.metricsHandler());

  // ── 15. 404 ──────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  // ── 16. Error handler global ─────────────────────────────────
  app.use(ErrorHandler.handle);

  return app;
}

module.exports = criarApp;
