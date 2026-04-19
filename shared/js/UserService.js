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
 *
 * Dependências (carregadas antes):
 *   AppState.js, SupabaseService.js, AuthGuard.js
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

  return Object.freeze({ getUser, getPerfil, fetchUser, requireAuth });
})();
