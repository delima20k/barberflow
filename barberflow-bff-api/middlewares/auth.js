'use strict';

const jwt = require('jsonwebtoken');

/**
 * AuthMiddleware — Verificação de JWT do Supabase Auth.
 *
 * Estratégia (ordem de prioridade):
 *   1. LOCAL (zero latência): SUPABASE_JWT_SECRET → verifica HS256 localmente.
 *   2. REDE (fallback): sem secret → usa supabase.auth.getUser(token).
 *
 * Após autenticação bem-sucedida, popula req.user = { id, email }.
 */
class AuthMiddleware {

  static #ALGORITHM = 'HS256';

  /** Singleton do cliente Supabase para fallback remoto (criado sob demanda). */
  static #supabase = null;

  /**
   * Retorna (ou cria) singleton do cliente Supabase.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  static #getSupabase() {
    if (!AuthMiddleware.#supabase) {
      const { createClient } = require('@supabase/supabase-js');
      AuthMiddleware.#supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
    }
    return AuthMiddleware.#supabase;
  }

  /**
   * Middleware que verifica o Bearer token e popula req.user.
   * @type {import('express').RequestHandler}
   */
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
      } catch {
        return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
      }
    }

    // ── Fallback: verificação por rede ───────────────────────────
    try {
      const supabase        = AuthMiddleware.#getSupabase();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
      }
      req.user = { id: data.user.id, email: data.user.email ?? '' };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
    }
  }
}

module.exports = AuthMiddleware;
