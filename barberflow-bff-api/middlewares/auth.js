'use strict';

const jwt            = require('jsonwebtoken');
const SupabaseClient = require('../utils/SupabaseClient');
const { logger }     = require('./logger');

/**
 * Cache TTL simples para o path de fallback (sem SUPABASE_JWT_SECRET).
 * Evita round-trips repetidos ao Supabase Auth para o mesmo token.
 * TTL: 5 minutos. Máximo: 1000 entradas (tokens simultâneos).
 */
class TtlCache {
  #map = new Map();
  #ttl;
  #max;

  constructor(ttlMs, max = 1000) {
    this.#ttl = ttlMs;
    this.#max = max;
  }

  get(key) {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) { this.#map.delete(key); return undefined; }
    return entry.val;
  }

  set(key, val) {
    if (this.#map.size >= this.#max) {
      // Remove a entrada mais antiga (primeiro elemento do Map)
      this.#map.delete(this.#map.keys().next().value);
    }
    this.#map.set(key, { val, exp: Date.now() + this.#ttl });
  }

  delete(key) {
    this.#map.delete(key);
  }
}

const fallbackCache = new TtlCache(5 * 60 * 1000); // 5 minutos

/**
 * AuthMiddleware — Verificação de JWT do Supabase Auth.
 *
 * Estratégia (ordem de prioridade):
 *   1. LOCAL (zero latência): SUPABASE_JWT_SECRET → verifica HS256 localmente.
 *   2. REDE com cache (fallback): sem secret → usa supabase.auth.getUser(token)
 *      com cache TTL de 5min para evitar round-trips repetidos.
 *
 * Após autenticação bem-sucedida, popula req.user = { id, email }.
 */
class AuthMiddleware {

  static #ALGORITHM = 'HS256';

  /**
   * Middleware que verifica o Bearer token e popula req.user.
   * @type {import('express').RequestHandler}
   */
  /**
   * Remove o token do cache de fallback imediatamente (chamado no logout).
   * Impede que um token revogado no Supabase continue válido pelo TTL restante.
   * @param {string} token — Bearer token sem o prefixo "Bearer "
   */
  static invalidarToken(token) {
    if (token) fallbackCache.delete(token);
  }

  static async verificar(req, res, next) {
    const auth = req.headers['authorization'] ?? '';

    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token de autenticação ausente.' });
    }

    const token = auth.slice(7);

    // ── Verificação local (zero latência) ────────────────────────
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      try {
        const payload = jwt.verify(token, secret, { algorithms: [AuthMiddleware.#ALGORITHM] });
        req.user = { id: payload.sub, email: payload.email ?? '' };
        return next();
      } catch (err) {
        // JsonWebTokenError('invalid algorithm'): token é RS256, emitido após a migração
        // do Supabase para JWT Signing Keys. Cai no fallback de rede para verificação correta.
        if (err.name !== 'JsonWebTokenError' || err.message !== 'invalid algorithm') {
          return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
        }
      }
    }

    // ── Fallback: verificação por rede com cache TTL ──────────────
    try {
      const cached = fallbackCache.get(token);
      if (cached) {
        req.user = cached;
        return next();
      }

      const { data, error } = await SupabaseClient.getInstance().auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
      }

      const user = { id: data.user.id, email: data.user.email ?? '' };
      fallbackCache.set(token, user);
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
    }
  }
}

module.exports = AuthMiddleware;

// Aviso único de startup: SUPABASE_JWT_SECRET ausente significa round-trip à rede
// em cada verificação de token (maior latência e dependência do Supabase Auth).
// Configure esta variável no Vercel para verificação local sem latência.
if (!process.env.SUPABASE_JWT_SECRET && process.env.APP_ENV !== 'test') {
  logger.warn(
    '[AuthMiddleware] SUPABASE_JWT_SECRET não configurado — ' +
    'tokens verificados via Supabase Auth (rede). ' +
    'Defina SUPABASE_JWT_SECRET no Vercel para verificação local e zero latência.',
  );
}
