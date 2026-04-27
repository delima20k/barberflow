'use strict';

// =============================================================
// AuthMiddleware.js — Middleware Express de autenticação JWT.
//
// Estratégia de verificação (em ordem de prioridade):
//
//   1. LOCAL (zero latência): se SUPABASE_JWT_SECRET estiver configurado,
//      verifica o JWT do Supabase Auth diretamente com TokenService —
//      sem nenhuma chamada HTTP ao Supabase.
//
//   2. REDE (fallback): se o secret não estiver disponível,
//      usa supabase.auth.getUser(token) para verificação remota.
//
// req.user sempre terá: { id: string, email: string }
//
// Uso:
//   router.use(AuthMiddleware.verificar);
//   router.get('/rota', AuthMiddleware.verificar, handler);
// =============================================================

const supabase    = require('./SupabaseClient');
const TokenService = require('./TokenService');

class AuthMiddleware {

  /**
   * Verifica JWT do header Authorization e popula req.user.
   * Retorna 401 se ausente, inválido ou expirado.
   * @type {import('express').RequestHandler}
   */
  static async verificar(req, res, next) {
    const auth = req.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token de autenticação ausente.' });
    }

    const token = auth.slice(7);

    // ── Prioridade 1: verificação local (sem latência de rede) ───────────────
    // Disponível quando SUPABASE_JWT_SECRET está configurado no ambiente.
    // Supabase JWT: sub = userId, email = email do usuário.
    if (process.env.SUPABASE_JWT_SECRET) {
      try {
        const payload = TokenService.verificarSupabase(token);
        req.user = { id: payload.sub, email: payload.email ?? '' };
        return next();
      } catch {
        return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
      }
    }

    // ── Prioridade 2: verificação por rede (fallback) ────────────────────────
    // Usado quando SUPABASE_JWT_SECRET não está disponível (ex: ambiente CI).
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
    }

    req.user = { id: data.user.id, email: data.user.email ?? '' };
    next();
  }
}

module.exports = AuthMiddleware;

