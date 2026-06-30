'use strict';

const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { logger } = require('./logger');

const IS_PROD = process.env.APP_ENV === 'production';

// ── Redis store (Upstash) — compartilhado entre instâncias serverless ──────────
// Sem Redis configurado: MemoryStore padrão (dev/test).
// Com Redis: contadores são globais — rate limit efetivo independente de quantas
// instâncias Vercel estejam rodando.
let _redisStore = null;
let _memoryStoreWarningLogged = false;
let _authEmailMemoryStoreErrorLogged = false;
let _usingRedisStore = false;

function _criarRedisStore() {
  if (_redisStore !== null) return _redisStore;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _redisStore = undefined;
    _usingRedisStore = false;
    _warnMemoryStore('UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ausentes');
    return undefined;
  }

  try {
    // rate-limit-redis + @upstash/redis (REST client, serverless-compatible)
    const { Redis }    = require('@upstash/redis');
    const RedisStore   = require('rate-limit-redis');
    const redis        = new Redis({ url, token });
    _redisStore = new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) });
    _usingRedisStore = true;
    logger.info('[BFF] Rate limiter usando Upstash Redis (modo produção)');
  } catch (err) {
    logger.warn({ err }, '[BFF] Upstash Redis indisponível — usando MemoryStore');
    _redisStore = undefined;
    _usingRedisStore = false;
    _warnMemoryStore('falha ao inicializar Upstash Redis');
  }
  return _redisStore;
}

function _warnMemoryStore(reason) {
  if (!IS_PROD || _memoryStoreWarningLogged) return;
  _memoryStoreWarningLogged = true;
  logger.warn(
    { reason },
    '[BFF] Rate limiter usando MemoryStore em producao; em serverless o limite nao e compartilhado entre instancias.',
  );
}

function _normalizarEmailRateLimit(req) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  return email ? `email:${email}` : 'email:missing';
}

function _authEmailHashSecret() {
  const secret = String(process.env.AUTH_EMAIL_HASH_SECRET || '').trim();
  if (secret.length >= 32) return secret;
  throw new Error('AUTH_EMAIL_HASH_SECRET ausente ou fraco para auth email rate limit.');
}

function _hashEmail(email) {
  return crypto
    .createHmac('sha256', _authEmailHashSecret())
    .update(String(email || '').trim().toLowerCase())
    .digest('hex');
}

function _authEmailPurpose(req) {
  const path = String(req.path || req.originalUrl || '');
  if (path.includes('signup-confirmation')) return 'signup-confirmation';
  if (path.includes('forgot-password')) return 'forgot-password';
  return 'auth-email';
}

async function _consumeAuthEmailDbFallback(req) {
  const purpose = _authEmailPurpose(req);
  if (!['forgot-password', 'signup-confirmation'].includes(purpose)) {
    return { allowed: true, skipped: true };
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) return { allowed: true, skipped: true };

  const emailHash = _hashEmail(email);
  const SupabaseClient = require('../utils/SupabaseClient');
  const db = SupabaseClient.getInstance();
  if (typeof db?.rpc !== 'function') {
    throw new Error('Supabase RPC indisponivel para auth email rate limit.');
  }

  const { data, error } = await db.rpc('consume_auth_email_attempt', {
    p_email_hash: emailHash,
    p_purpose: purpose,
    p_window_seconds: 60 * 60,
    p_max_attempts: 3,
  });

  if (error) throw new Error(error.message || 'Falha no auth email DB rate limit.');
  return {
    allowed: data?.allowed !== false,
    attempts: Number(data?.attempts || 0),
    maxAttempts: Number(data?.maxAttempts || 3),
    purpose,
    emailHashPrefix: emailHash.slice(0, 12),
  };
}

/**
 * RateLimiterMiddleware — Rate limiting por IP para o BFF.
 *
 * Em produção com UPSTASH_REDIS_REST_URL configurado: usa RedisStore compartilhado
 * entre todas as instâncias serverless (Vercel) — rate limit global e efetivo.
 *
 * Em desenvolvimento/staging ou sem Redis: usa MemoryStore (padrão express-rate-limit).
 *
 * Limites:
 *   geral:   300 req / 1 min   (todas as rotas — exceto health)
 *   auth:     10 req / 15 min  (login, signup, refresh)
 *   escrita:  60 req / 1 min   (POST, PATCH, DELETE)
 */
class RateLimiterMiddleware {

  static #onLimit(req, res) {
    logger.warn({ ip: req.ip, path: req.path }, '[BFF] Rate limit atingido');
    res.status(429).json({ ok: false, error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  static async authEmailDbFallback(req, res, next) {
    if (process.env.APP_ENV === 'test' || _usingRedisStore) return next();

    if (IS_PROD && !_authEmailMemoryStoreErrorLogged) {
      _authEmailMemoryStoreErrorLogged = true;
      logger.error(
        {
          route: req.originalUrl || req.path,
          mitigation: 'consume_auth_email_attempt',
          requiredEnv: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
        },
        '[BFF][CRITICAL] Auth email rate limit usando MemoryStore em producao; ativando fallback distribuido via Supabase.',
      );
    }

    if (!IS_PROD) return next();

    try {
      const result = await _consumeAuthEmailDbFallback(req);
      if (!result.allowed) {
        logger.warn(
          {
            purpose: result.purpose,
            emailHashPrefix: result.emailHashPrefix,
            attempts: result.attempts,
            maxAttempts: result.maxAttempts,
          },
          '[BFF] Auth email DB rate limit atingido',
        );
        return res.status(429).json({ ok: false, error: 'Muitas requisições. Tente novamente em instantes.' });
      }
    } catch (err) {
      logger.error(
        { err, route: req.originalUrl || req.path },
        '[BFF][CRITICAL] Fallback distribuido de auth email rate limit falhou; MemoryStore continua sem compartilhamento entre instancias.',
      );
    }

    return next();
  }

  static geral = rateLimit({
    windowMs:        60 * 1000,
    max:             300,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    skip:            (req) => req.method === 'GET' && /\/health$/.test(req.path),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static auth = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    // Pula apenas em test — brute force em /api/auth deve ser bloqueado também em dev.
    skip:            () => process.env.APP_ENV === 'test',
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static escrita = rateLimit({
    windowMs:        60 * 1000,
    max:             60,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    skip:            (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  // 10 mensagens de portfólio por IP/usuário a cada 5 minutos
  static portfolioMensagem = rateLimit({
    windowMs:        5 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    keyGenerator:    (req) => `portfolio:${req.user?.id ?? ipKeyGenerator(req.ip)}`,
    skip:            () => process.env.APP_ENV === 'test',
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static storyMensagem = rateLimit({
    windowMs:        5 * 60 * 1000,
    max:             10,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    keyGenerator:    (req) => `story:${req.user?.id ?? ipKeyGenerator(req.ip)}`,
    skip:            () => process.env.APP_ENV === 'test',
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static authEmailIp = rateLimit({
    windowMs:        60 * 60 * 1000,
    max:             5,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    keyGenerator:    (req) => `auth-email:ip:${ipKeyGenerator(req.ip)}`,
    skip:            () => process.env.APP_ENV === 'test',
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });

  static authEmailConta = rateLimit({
    windowMs:        60 * 60 * 1000,
    max:             3,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    store:           _criarRedisStore(),
    keyGenerator:    (req) => `auth-email:${_normalizarEmailRateLimit(req)}`,
    skip:            () => process.env.APP_ENV === 'test',
    handler:         (req, res) => RateLimiterMiddleware.#onLimit(req, res),
  });
}

module.exports = RateLimiterMiddleware;
