'use strict';

const BaseController = require('./BaseController');

/**
 * HealthzController — Health checks reais de liveness e readiness.
 *
 * GET /health/live   → liveness: processo está vivo?
 *   Sempre 200 enquanto o processo responde.
 *   Usado pelo orquestrador (K8s, Railway, etc.) para reiniciar se morrer.
 *
 * GET /health/ready  → readiness: todas as dependências estão acessíveis?
 *   200 se tudo OK, 503 se alguma dependência estiver indisponível.
 *   Usado pelo load balancer para tirar o pod do tráfego durante cold start
 *   ou degradação de dependência.
 *
 * Verificações de readiness:
 *   - Supabase: SELECT 1 row de profiles (verifica conexão + auth)
 *   - Redis:    PING (verifica conexão)
 *
 * SLOs internos da rota:
 *   /health/live  → p99 < 5ms   (nunca bloqueia)
 *   /health/ready → p99 < 500ms (I/O real com timeout)
 */
class HealthzController extends BaseController {
  #supabase;
  #redis;
  #version;

  /** @param {{ supabase?: object, redis?: object }} deps */
  constructor({ supabase = null, redis = null } = {}) {
    super();
    this.#supabase = supabase;
    this.#redis    = redis;
    this.#version  = process.env.APP_VERSION ?? '1.0.0';
  }

  /**
   * GET /health/live
   * Responde 200 enquanto o processo HTTP está vivo.
   * @param {import('express').Request}  _req
   * @param {import('express').Response} res
   */
  live(_req, res) {
    res.status(200).json({
      ok:        true,
      status:    'live',
      version:   this.#version,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /health/ready
   * Verifica conectividade real com Supabase e Redis.
   * @param {import('express').Request}  _req
   * @param {import('express').Response} res
   */
  async ready(_req, res) {
    const [supabaseResult, redisResult] = await Promise.allSettled([
      this.#pingSupabase(),
      this.#pingRedis(),
    ]);

    const supabase = HealthzController.#toCheck(supabaseResult);
    const redis    = HealthzController.#toCheck(redisResult);

    const allOk = supabase.ok && redis.ok;

    res.status(allOk ? 200 : 503).json({
      ok:        allOk,
      status:    allOk ? 'ready' : 'degraded',
      version:   this.#version,
      timestamp: new Date().toISOString(),
      dependencies: { supabase, redis },
    });
  }

  // ── Checks privados ────────────────────────────────────────────

  async #pingSupabase() {
    if (!this.#supabase) return { ok: true, latencyMs: null, note: 'not-configured' };

    const t0 = Date.now();
    const { error } = await this.#supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle();

    const latencyMs = Date.now() - t0;

    // PGRST116 = "row not found" — conexão OK, apenas sem dados
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    return { ok: true, latencyMs };
  }

  async #pingRedis() {
    if (!this.#redis) return { ok: true, latencyMs: null, note: 'not-configured' };

    const t0 = Date.now();
    await this.#redis.ping();
    return { ok: true, latencyMs: Date.now() - t0 };
  }

  // ── Util estático ──────────────────────────────────────────────

  /**
   * Converte PromiseSettledResult em objeto de check uniforme.
   * @param {PromiseSettledResult<object>} settled
   * @returns {{ ok: boolean, latencyMs: number|null, error?: string }}
   */
  static #toCheck(settled) {
    if (settled.status === 'fulfilled') return settled.value;
    return {
      ok:        false,
      latencyMs: null,
      error:     settled.reason?.message ?? 'unknown',
    };
  }
}

module.exports = HealthzController;
