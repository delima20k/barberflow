'use strict';

/**
 * UserService — Abstração de identidade do usuário corrente.
 *
 * Centraliza "quem é o usuário atual" em um único ponto.
 * AppState é a fonte única de verdade — SupabaseService só é acessado
 * via fetchUser(), que atualiza o AppState após a resposta.
 *
 * API pública:
 *   UserService.getUser()          → leitura síncrona do AppState (cache, zero rede)
 *   UserService.fetchUser(force?)  → busca no Supabase; usa cache se já existir
 *   UserService.getPerfil()        → AppState.get('perfil') — linha da tabela profiles
 *
 * Dependências (carregadas antes):
 *   AppState.js, SupabaseService.js
 */
const UserService = (() => {
  'use strict';

  // ── Leitura síncrona (cache) ───────────────────────────────

  /**
   * Retorna o objeto Supabase User corrente do AppState (ou null).
   * Zero rede — consulta apenas o estado em memória.
   * @returns {object|null}
   */
  function getUser() {
    if (typeof AppState === 'undefined') return null;
    return AppState.getUser();
  }

  /**
   * Retorna o perfil em cache do AppState (ou null).
   * Zero rede — consulta apenas o estado em memória.
   * @returns {object|null}
   */
  function getPerfil() {
    if (typeof AppState === 'undefined') return null;
    return AppState.get('perfil');
  }

  // ── Busca com cache inteligente ────────────────────────────

  /**
   * Retorna o usuário autenticado, buscando no Supabase apenas quando necessário.
   *
   * Estratégia de cache:
   *   1. Se já existir no AppState e `force` for false → retorna do cache (zero rede)
   *   2. Se não existir ou `force=true` → busca no Supabase e atualiza AppState
   *
   * @param {boolean} [force=false] — ignora cache e força nova requisição
   * @returns {Promise<object|null>}
   *
   * @example
   *   const user = await UserService.fetchUser();         // usa cache se disponível
   *   const user = await UserService.fetchUser(true);     // força busca na API
   */
  async function fetchUser(force = false) {
    if (typeof AppState === 'undefined') return null;

    // Cache hit — evita chamada de rede desnecessária
    const cached = AppState.getUser();
    if (cached && !force) return cached;

    // Cache miss ou force=true — busca no Supabase
    if (typeof SupabaseService === 'undefined') return cached ?? null;

    try {
      const user = await SupabaseService.getUser();
      if (user) AppState.set('user', user);
      return user ?? null;
    } catch (e) {
      console.warn('[UserService] fetchUser falhou:', e?.message);
      return cached ?? null; // fallback para o cache anterior em caso de erro
    }
  }

  return Object.freeze({ getUser, getPerfil, fetchUser });
})();
