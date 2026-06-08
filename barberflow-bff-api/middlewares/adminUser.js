'use strict';

const { AdminUserRepository } = require('../infrastructure/config/AdminUserRepository');

// ============================================================
// AdminUserMiddleware — verifica se o usuário autenticado
// possui registro ativo na tabela admin_users.
//
// Deve ser usado APÓS AuthMiddleware.verificar, que popula
// req.user = { id, email }.
//
// Retorna 403 se o usuário não for administrador ativo.
// ============================================================

class AdminUserMiddleware {

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   * @returns {import('express').RequestHandler}
   */
  static criarVerificador(db) {
    const repo = new AdminUserRepository(db);

    return async function verificarAdmin(req, res, next) {
      try {
        // req.user é populado por AuthMiddleware.verificar
        const userId = req.user?.id;
        const email  = req.user?.email;

        if (!userId || !email) {
          return res.status(401).json({ ok: false, error: 'Não autenticado.' });
        }

        const admin = await repo.findActive(userId, email);
        if (!admin) {
          return res.status(403).json({ ok: false, error: 'Acesso restrito a administradores.' });
        }

        req.admin = admin;
        next();
      } catch (err) {
        next(err);
      }
    };
  }
}

module.exports = { AdminUserMiddleware };
