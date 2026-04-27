'use strict';

// =============================================================
// AuthMiddleware.js — Middleware Express de autenticação JWT.
//
// Verifica o token Bearer no header Authorization via Supabase.
// Anexa o usuário autenticado em req.user.
//
// Uso:
//   router.use(AuthMiddleware.verificar);
//   router.get('/rota', AuthMiddleware.verificar, handler);
// =============================================================

const supabase = require('./SupabaseClient');

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
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
    }

    req.user = data.user;
    next();
  }
}

module.exports = AuthMiddleware;
