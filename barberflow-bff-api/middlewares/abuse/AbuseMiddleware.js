'use strict';

const { InMemoryStore }              = require('./StoreAdapter');
const { RateLimiter, SlidingWindow, TokenBucket } = require('./RateLimiter');
const { AbuseDetector }              = require('./AbuseDetector');
const { ReputationScore }            = require('./ReputationScore');
const { ActionPolicy, Action }       = require('./ActionPolicy');
const { DynamicList }                = require('./DynamicList');
const { AbuseEventLog }              = require('./AbuseEventLog');
const { getEndpointConfig }          = require('./AbuseConfig');

// ─────────────────────────────────────────────────────────────────────────────
// AbuseMiddleware — camada anti-abuso transversal para HTTP, WS e filas.
//
// Fluxo por requisição:
//   1. Rate limit (SlidingWindow ou TokenBucket por endpoint)
//   2. Construção do contexto de avaliação
//   3. Consulta à DynamicList (allow/deny com TTL)
//   4. Avaliação das regras (AbuseDetector + Specification)
//   5. Ajuste de reputação se abuso detectado
//   6. Escalada de risco se rate limit excedido
//   7. Decisão (ActionPolicy)
//   8. Auditoria (AbuseEventLog) para decisões não-allow
// ─────────────────────────────────────────────────────────────────────────────

class AbuseMiddleware {
  static #store      = new InMemoryStore();
  static #reputation = new ReputationScore().startDecay();
  static #dynList    = new DynamicList();
  static #limiters   = new Map(); // `${method}:${path}` → RateLimiter

  /**
   * Inicializa com store externo (Redis para produção).
   * Deve ser chamado no bootstrap do servidor antes de criarApp().
   * @param {object} [opts]
   * @param {import('./StoreAdapter').StoreAdapter} [opts.store]
   * @returns {typeof AbuseMiddleware}
   */
  static init({ store } = {}) {
    if (store) {
      AbuseMiddleware.#store   = store;
      AbuseMiddleware.#limiters.clear(); // limpa limiters para recriar com novo store
    }
    AbuseMiddleware.#reputation = new ReputationScore().startDecay();
    return AbuseMiddleware;
  }

  static #getLimiter(endpointKey, cfg) {
    if (AbuseMiddleware.#limiters.has(endpointKey)) return AbuseMiddleware.#limiters.get(endpointKey);

    const strategy = cfg.strategy === 'token_bucket'
      ? new TokenBucket({ store: AbuseMiddleware.#store, capacity: cfg.capacity, refillPerSec: cfg.refillPerSec })
      : new SlidingWindow({ store: AbuseMiddleware.#store, windowMs: cfg.windowMs, max: cfg.max });

    const limiter = new RateLimiter(strategy);
    AbuseMiddleware.#limiters.set(endpointKey, limiter);
    return limiter;
  }

  /** @private */
  static #identidade(req) {
    return req.user?.id ?? req.ip ?? req.socket?.remoteAddress ?? 'anonymous';
  }

  /** @private */
  static #buildCtx(req, requestCount) {
    return {
      userId:            req.user?.id ?? null,
      ip:                req.ip ?? req.socket?.remoteAddress ?? null,
      endpoint:          req.path,
      method:            req.method,
      userAgent:         req.headers?.['user-agent'] ?? null,
      payload:           req.body ?? {},
      accountAgeMs:      req.user?.created_at
                           ? Date.now() - new Date(req.user.created_at).getTime()
                           : null,
      requestCount,
      lastLocations:     req._abuseLocations     ?? [],
      contentHistory:    req._abuseContentHistory ?? [],
      currentContent:    typeof req.body?.content === 'string'  ? req.body.content
                       : typeof req.body?.message === 'string'  ? req.body.message
                       : null,
      requestTimestamps: req._abuseTimestamps ?? [],
    };
  }

  /** @private */
  static #applyDecision(decision, req, res, next) {
    if (decision.isAllowed || decision.isThrottled) {
      if (decision.isThrottled) {
        res.setHeader('Retry-After', Math.ceil(decision.retryAfterMs / 1000));
      }
      return next();
    }

    if (decision.requiresChallenge) {
      return res.status(403).json({
        ok: false, error: 'challenge_required',
        message: 'Verificação adicional necessária (captcha/2FA).',
      });
    }

    const status = decision.action === Action.HARD_BLOCK ? 403 : 429;
    return res.status(status).json({
      ok:           false,
      error:        decision.action,
      message:      'Requisição bloqueada por política de segurança.',
      retryAfterMs: decision.retryAfterMs || undefined,
    });
  }

  /**
   * Retorna middleware Express HTTP.
   * Aplica rate limit + detecção de abuso + política de ação para a rota.
   *
   * @param {object} [overrideCfg] — sobrescreve config de endpoint (opcional)
   * @returns {import('express').RequestHandler}
   */
  static forHttp(overrideCfg = null) {
    return async (req, res, next) => {
      const cfg         = overrideCfg ?? getEndpointConfig(req.method, req.path);
      const endpointKey = `${req.method}:${req.path}`;
      const identity    = AbuseMiddleware.#identidade(req);
      const rateKey     = `${endpointKey}:${identity}`;

      // 1. Rate limit
      const limiter    = AbuseMiddleware.#getLimiter(endpointKey, cfg);
      const rateResult = await limiter.consume(rateKey);

      // 2. Contexto
      const ctx = AbuseMiddleware.#buildCtx(req, cfg.max - rateResult.remaining);

      // 3. Lista dinâmica
      const dynEntry = AbuseMiddleware.#dynList.check(identity);

      // 4. Detecção de abuso
      const signal = await AbuseDetector.evaluate(ctx, cfg.rules);

      // 5. Penaliza reputação se abuso detectado
      if (signal.isAbusive && req.user?.id) {
        AbuseMiddleware.#reputation.penalize(req.user.id, signal.riskScore / 10);
      }

      // 6. Escalada: rate limit excedido → risco mínimo 80
      if (!rateResult.allowed) signal.riskScore = Math.max(signal.riskScore, 80);

      // 7. Decisão
      const reputation = AbuseMiddleware.#reputation.getScore(identity);
      const decision   = ActionPolicy.decide(reputation, signal, dynEntry);

      // 8. Auditoria
      if (!decision.isAllowed) {
        AbuseEventLog.record({
          userId:         req.user?.id ?? null,
          ip:             req.ip,
          endpoint:       req.path,
          action:         decision.action,
          reason:         decision.reason,
          triggeredRules: signal.triggeredRules,
          riskScore:      signal.riskScore,
        });
      }

      AbuseMiddleware.#applyDecision(decision, req, res, next);
    };
  }

  /**
   * Gate para WebSocket — retorna true se a conexão deve ser aceita.
   *
   * @param {{ userId?: string, ip: string, userAgent?: string, requestTimestamps?: number[] }} wsCtx
   * @returns {Promise<{ accepted: boolean, reason?: string }>}
   */
  static async forWS(wsCtx) {
    const identity = wsCtx.userId ?? wsCtx.ip;
    const dynEntry = AbuseMiddleware.#dynList.check(identity);

    const signal = await AbuseDetector.evaluate({
      ...wsCtx,
      requestCount:   0,
      accountAgeMs:   null,
      contentHistory: [],
      currentContent: null,
      lastLocations:  wsCtx.lastLocations ?? [],
    }, ['bot_signature', 'geo_velocity']);

    const reputation = AbuseMiddleware.#reputation.getScore(identity);
    const decision   = ActionPolicy.decide(reputation, signal, dynEntry);

    if (!decision.isAllowed && !decision.isThrottled) {
      AbuseEventLog.record({
        userId:         wsCtx.userId ?? null,
        ip:             wsCtx.ip,
        endpoint:       'WS_CONNECT',
        action:         decision.action,
        reason:         decision.reason,
        triggeredRules: signal.triggeredRules,
        riskScore:      signal.riskScore,
      });
      return { accepted: false, reason: decision.reason };
    }
    return { accepted: true };
  }

  /**
   * Gate para enqueue em filas críticas (BullMQ).
   *
   * @param {{ userId: string, queueName: string, payload: object }} queueCtx
   * @returns {Promise<{ enqueued: boolean, reason?: string }>}
   */
  static async forQueue(queueCtx) {
    const { userId, queueName, payload } = queueCtx;
    const cfg      = getEndpointConfig('POST', `/api/${queueName}`);
    const rateKey  = `queue:${queueName}:${userId}`;
    const limiter  = AbuseMiddleware.#getLimiter(`queue:${queueName}`, cfg);
    const result   = await limiter.consume(rateKey);

    const signal = await AbuseDetector.evaluate({
      userId,
      ip:                null,
      requestCount:      cfg.max - result.remaining,
      accountAgeMs:      null,
      userAgent:         null,
      payload,
      lastLocations:     [],
      contentHistory:    [],
      currentContent:    typeof payload?.content === 'string' ? payload.content : null,
      requestTimestamps: [],
    }, cfg.rules);

    if (!result.allowed) signal.riskScore = Math.max(signal.riskScore, 80);

    const dynEntry   = AbuseMiddleware.#dynList.check(userId);
    const reputation = AbuseMiddleware.#reputation.getScore(userId);
    const decision   = ActionPolicy.decide(reputation, signal, dynEntry);

    if (decision.isBlocked) {
      AbuseEventLog.record({
        userId,
        ip:             null,
        endpoint:       `QUEUE:${queueName}`,
        action:         decision.action,
        reason:         decision.reason,
        triggeredRules: signal.triggeredRules,
        riskScore:      signal.riskScore,
      });
      return { enqueued: false, reason: decision.reason };
    }
    return { enqueued: true };
  }

  // ── Acesso público às dependências internas (admin / testes) ────────────────
  static get dynList()    { return AbuseMiddleware.#dynList; }
  static get reputation() { return AbuseMiddleware.#reputation; }
}

module.exports = { AbuseMiddleware };
