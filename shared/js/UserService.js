'use strict';

/**
 * UserService — Abstração de identidade do usuário corrente.
 *
 * Centraliza "quem é o usuário atual" em um único ponto.
 * AppState é a fonte única de verdade — SupabaseService só é acessado
 * via fetchUser(), que atualiza o AppState após a resposta.
 *
 * API pública:
 *   UserService.getUser()           → leitura síncrona do AppState (cache, zero rede)
 *   UserService.fetchUser(force?)   → busca no Supabase; usa cache se já existir
 *   UserService.getPerfil()         → AppState.get('perfil') — linha da tabela profiles
 *   UserService.requireAuth(router) → verifica login; redireciona para 'login' se necessário
 *   UserService.refresh()           → busca user + perfil na API e sincroniza AppState
 *
 * Dependências (carregadas antes):
 *   AppState.js, SupabaseService.js, AuthService.js, AuthGuard.js
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

  // ── Proteção de rotas ─────────────────────────────────────

  /**
   * Verifica se o usuário está autenticado.
   * Se não estiver, redireciona para a tela 'login' via router e retorna false.
   * Delega ao AuthGuard para não duplicar a lógica de proteção.
   * Fallback direto ao AppState caso AuthGuard não esteja carregado.
   *
   * @param {Router} router — instância do app (App ou Pro)
   * @returns {boolean} true = autenticado | false = bloqueado e redirecionado
   *
   * @example
   *   // Em qualquer Page ou Service:
   *   if (!UserService.requireAuth(App)) return;
   *   // ... continua apenas se logado
   */
  function requireAuth(router) {
    // Delega ao AuthGuard quando disponível (fonte única da regra)
    if (typeof AuthGuard !== 'undefined') return AuthGuard.requireAuth(router);

    // Fallback: aplica a regra diretamente via AppState
    const logado = typeof AppState !== 'undefined' && AppState.isLogged();
    if (!logado && router && typeof router.push === 'function') router.push('login');
    return logado;
  }

  // ── Sincronização ─────────────────────────────────────────

  /**
   * Busca user e perfil frescos na API e sincroniza o AppState.
   * Deve ser chamado após login, logout ou qualquer situação que
   * possa ter deixado o estado desatualizado.
   *
   * Fluxo:
   *   1. SupabaseService.getUser()          → objeto User (ou null se sem sessão)
   *   2. AuthService._carregarPerfil(id)    → linha fresca da tabela profiles
   *   3. AppState.login(user, perfil)        → atualiza estado e isLogado=true
   *   Em caso de sem sessão: AppState.logout() limpa o estado.
   *
   * @returns {Promise<{ user: object|null, perfil: object|null }>}
   *
   * @example
   *   // Após restaurar sessão ou mudança de perfil:
   *   const { user, perfil } = await UserService.refresh();
   */
  async function refresh() {
    if (typeof AppState === 'undefined' || typeof SupabaseService === 'undefined') {
      return { user: null, perfil: null };
    }

    try {
      // 1. Busca o user autenticado no Supabase
      const user = await SupabaseService.getUser();

      if (!user) {
        // Sem sessão ativa — limpa o estado
        AppState.logout();
        return { user: null, perfil: null };
      }

      // 2. Busca o perfil fresco via AuthService
      const perfil = typeof AuthService !== 'undefined'
        ? await AuthService._carregarPerfil(user.id)
        : null;

      // 3. Sincroniza AppState atomicamente
      AppState.login(user, perfil);

      return { user, perfil };
    } catch (e) {
      console.warn('[UserService] refresh falhou:', e?.message);
      return { user: AppState.getUser(), perfil: AppState.get('perfil') };
    }
  }

  return Object.freeze({ getUser, getPerfil, fetchUser, requireAuth, refresh });
})();
