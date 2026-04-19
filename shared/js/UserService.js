'use strict';

/**
 * UserService — Abstração de identidade do usuário corrente.
 *
 * Centraliza "quem é o usuário atual" em um único ponto.
 * Nenhum outro serviço deve chamar SupabaseService.getUser()
 * ou AuthService.getPerfil() diretamente — usa UserService.
 *
 * API pública:
 *   UserService.getUser()    → usuário autenticado (via Supabase Auth, com rede)
 *   UserService.getPerfil()  → perfil em cache (sem rede, via AuthService)
 *
 * Dependências (carregadas antes):
 *   SupabaseService.js, AuthService.js
 */
const UserService = (() => {
  'use strict';

  /**
   * Retorna o usuário autenticado atual (ou null).
   * Faz uma chamada à rede via Supabase Auth.
   * @returns {Promise<object|null>}
   */
  async function getUser() {
    if (typeof SupabaseService === 'undefined') return null;
    return SupabaseService.getUser();
  }

  /**
   * Retorna o perfil em memória (sem rede).
   * Depende de AuthService ter carregado a sessão previamente.
   * @returns {object|null}
   */
  function getPerfil() {
    if (typeof AuthService === 'undefined') return null;
    return AuthService.getPerfil();
  }

  return Object.freeze({ getUser, getPerfil });
})();
