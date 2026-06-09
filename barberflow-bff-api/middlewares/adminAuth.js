'use strict';

// =============================================================
// adminAuth.js — Middleware de autenticação admin para o BFF.
// Camada: middlewares
//
// Verifica o JWT de admin emitido por POST /api/v1/admin/login.
// Usa ADMIN_JWT_SECRET (HS256, 4h, issuer=barberflow, type=admin).
// Tokens do Supabase Auth são explicitamente rejeitados —
// eles carregam type='access', nunca 'admin'.
//
// Uso:
//   router.use(AdminAuthMiddleware.verificar);
// =============================================================

const jwt = require('jsonwebtoken');

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

    const token  = auth.slice(7);
    const secret = process.env.ADMIN_JWT_SECRET;

    if (!secret) {
      return res.status(500).json({ ok: false, error: 'Configuração de servidor inválida.' });
    }

    try {
      const payload = jwt.verify(token, secret, {
        issuer:     'barberflow',
        algorithms: ['HS256'],
      });
      if (payload.type !== 'admin') {
        throw new Error('Tipo de token inválido.');
      }
      req.admin = { email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Token de admin inválido ou expirado.' });
    }
  }
}

module.exports = AdminAuthMiddleware;
