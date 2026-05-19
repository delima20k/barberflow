'use strict';

/**
 * RoleMiddleware — autorização baseada em roles.
 *
 * Após AuthMiddleware popular req.user com { id, email },
 * este middleware garante que o usuário possui um dos roles exigidos.
 *
 * A role é lida de req.user.role se já estiver presente (cacheada),
 * caso contrário é buscada na tabela `profiles` e cacheada em req.user.role
 * para evitar múltiplas queries na mesma requisição.
 *
 * Códigos de resposta:
 *   401 — req.user ausente (AuthMiddleware não executado)
 *   403 — role insuficiente
 *   503 — falha temporária na consulta ao banco
 *
 * Uso em rotas:
 *   router.use(RoleMiddleware.exigir('admin'))
 *   router.use(RoleMiddleware.profissional)
 *   router.get('/rota', RoleMiddleware.exigir('owner', 'manager'), handler)
 */
class RoleMiddleware {
  static #ROLES_VALIDOS = new Set(['client', 'barber', 'owner', 'manager', 'admin']);

  /**
   * Retorna middleware que exige um dos roles listados.
   * Carrega SupabaseClient de forma lazy para não falhar no boot
   * caso as variáveis de ambiente ainda não estejam configuradas.
   *
   * @param {...string} roles
   * @returns {import('express').RequestHandler}
   */
  static exigir(...roles) {
    // eslint-disable-next-line global-require
    const db = require('./SupabaseClient');
    return RoleMiddleware.#criarMiddleware(db, roles);
  }

  /**
   * Versão com supabase injetado — uso EXCLUSIVO em testes.
   * Permite injetar um mock do cliente Supabase.
   *
   * @param {object} db   — mock do SupabaseClient
   * @param {...string} roles
   * @returns {import('express').RequestHandler}
   */
  static _comSupabase(db, ...roles) {
    return RoleMiddleware.#criarMiddleware(db, roles);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Fábrica interna que produz o middleware com db e roles já definidos.
   *
   * @param {object}   db
   * @param {string[]} roles
   */
  static #criarMiddleware(db, roles) {
    return async (req, res, next) => {
      // 1. Autenticação prévia é obrigatória
      if (!req.user?.id) {
        return res.status(401).json({
          ok:    false,
          error: 'Autenticação necessária.',
        });
      }

      // 2. Garantir que req.user.role está populado (busca no banco se preciso)
      try {
        await RoleMiddleware.#garantirRole(req, db);
      } catch {
        return res.status(503).json({
          ok:    false,
          error: 'Serviço temporariamente indisponível.',
        });
      }

      // 3. Verificar permissão
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          ok:    false,
          error: 'Acesso não autorizado.',
        });
      }

      return next();
    };
  }

  /**
   * Popula req.user.role a partir do banco se não estiver cacheado.
   * Lança erro se a consulta falhar (o chamador captura e retorna 503).
   *
   * @param {object} req
   * @param {object} db  — cliente Supabase
   */
  static async #garantirRole(req, db) {
    if (req.user.role && RoleMiddleware.#ROLES_VALIDOS.has(req.user.role)) return;

    const { data, error } = await db
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    req.user.role = data?.role ?? 'client';
  }
}

// ─── Shorthands pré-computados ───────────────────────────────────────────────
// Definidos via Object.defineProperties com getters para evitar que
// require('./SupabaseClient') seja chamado no momento do import do módulo.
// O getter só é avaliado quando a propriedade é acessada (lazy).

Object.defineProperties(RoleMiddleware, {
  /** Exige role 'admin'. */
  admin: {
    get: () => RoleMiddleware.exigir('admin'),
    enumerable: true,
    configurable: false,
  },
  /** Exige role de profissional (barber, owner ou manager). */
  profissional: {
    get: () => RoleMiddleware.exigir('barber', 'owner', 'manager'),
    enumerable: true,
    configurable: false,
  },
  /** Exige role 'client'. */
  cliente: {
    get: () => RoleMiddleware.exigir('client'),
    enumerable: true,
    configurable: false,
  },
});

module.exports = RoleMiddleware;
