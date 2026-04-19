'use strict';

/**
 * UserService — Abstração de identidade do usuário corrente.
 *
 * Centraliza "quem é o usuário atual" em um único ponto.
 * Usa AppState como fonte única de verdade — sem chamadas de rede
 * e sem dependência direta de SupabaseService ou AuthService.
 *
 * API pública:
 *   UserService.getUser()    → AppState.get('user')   — objeto Supabase User ou null
 *   UserService.getPerfil()  → AppState.get('perfil') — linha da tabela profiles ou null
 *
 * Dependências (carregadas antes):
 *   AppState.js
 */
const UserService = (() => {
  'use strict';

  /**
   * Retorna o objeto Supabase User corrente (ou null).
   * Lê do AppState — sem chamada de rede.
   * @returns {object|null}
   */
  function getUser() {
    if (typeof AppState === 'undefined') return null;
    return AppState.getUser();
  }

  /**
   * Retorna o perfil em cache (ou null).
   * Lê do AppState — sem chamada de rede.
   * @returns {object|null}
   */
  function getPerfil() {
    if (typeof AppState === 'undefined') return null;
    return AppState.get('perfil');
  }

  return Object.freeze({ getUser, getPerfil });
})();
