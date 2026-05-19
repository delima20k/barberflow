'use strict';

// =============================================================
// AdminAuthMiddleware.js — Middleware Express de autenticação admin.
// Camada: infra
//
// Verifica o JWT de admin emitido por TokenService.gerarAdmin().
// Tokens do Supabase Auth são EXPLICITAMENTE rejeitados —
// eles carregam type='access' ou não carregam 'type', nunca 'admin'.
//
// Uso:
//   router.use(AdminAuthMiddleware.verificar);
//   router.get('/rota', AdminAuthMiddleware.verificar, handler);
// =============================================================

const TokenService = require('./TokenService');

class AdminAuthMiddleware {

  /**
   * Verifica JWT de admin no header Authorization.
   * Popula req.admin = { email } e chama next().
   * Retorna 401 se ausente, inválido, expirado ou tipo errado.
   * @type {import('express').RequestHandler}
   */
  static verificar(req, res, next) {
    const auth = req.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token de admin ausente.' });
    }

    const token = auth.slice(7);

    try {
      const payload = TokenService.verificarAdmin(token);
      req.admin = { email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Token de admin inválido ou expirado.' });
    }
  }
}

module.exports = AdminAuthMiddleware;
