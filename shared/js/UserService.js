'use strict';

/**
 * UserService — Fonte única de verdade sobre o usuário corrente.
 *
 * Responsabilidades:
 *   Identidade    → getUser(), getUserId()
 *   Perfil        → getPerfil()
 *   Role          → getRole(), isProfessional(), isClient()
 *   Estado login  → isLogged()
 *   Rede          → fetchUser(), refresh()
 *   Proteção      → requireAuth(router)
 *
 * Regra de ouro:
 *   getUser(), getPerfil(), isLogged(), getRole() → NUNCA fazem rede (cache).
 *   fetchUser(), refresh()                        → SEMPRE fazem rede.
 *   AuthService NÃO deve ser acessado diretamente — passe por UserService.
 *
 * Dependências (carregadas antes):
 *   AppState.js, SupabaseService.js, AuthService.js, AuthGuard.js
 */
const UserService = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // CACHE — leitura síncrona, zero rede
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna o Supabase User do AppState.
   * Contrato: NUNCA faz rede. Retorna null se não autenticado.
   * @returns {object|null}
   */
  function getUser() {
    if (typeof AppState === 'undefined') return null;
    return AppState.getUser();
  }

  /**
   * Retorna o perfil em cache do AppState.
   * Contrato: NUNCA faz rede. Retorna null se não carregado.
   * @returns {object|null}
   */
  function getPerfil() {
    if (typeof AppState === 'undefined') return null;
    return AppState.get('perfil');
  }

  // ═══════════════════════════════════════════════════════════
  // REDE — busca assíncrona, sempre vai à API
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca o usuário autenticado diretamente no Supabase Auth e atualiza AppState.
   * Contrato: SEMPRE faz rede — não usa cache interno.
   * Use getUser() se quiser leitura rápida do cache.
   *
   * @returns {Promise<object|null>}
   *
   * @example
   *   // Leitura rápida (padrão):
   *   const user = UserService.getUser();
   *
   *   // Quando precisar garantir dados frescos do Supabase:
   *   const user = await UserService.fetchUser();
   */
  async function fetchUser() {
    if (typeof AppState === 'undefined' || typeof SupabaseService === 'undefined') {
      return AppState?.getUser() ?? null;
    }

    try {
      const user = await SupabaseService.getUser();
      if (user) AppState.set('user', user);
      return user ?? null;
    } catch (e) {
      console.warn('[UserService] fetchUser falhou:', e?.message);
      return AppState.getUser(); // fallback para cache em caso de erro de rede
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SINCRONIZAÇÃO — user + perfil, atualiza AppState atomicamente
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca user e perfil frescos na API e sincroniza o AppState de forma atômica.
   * Contrato: SEMPRE faz rede (user via Supabase Auth + perfil via profiles).
   *
   * Quando usar:
   *   - Após login bem-sucedido
   *   - Ao restaurar sessão no boot do app
   *   - Após atualização de dados do perfil
   *
   * Fluxo:
   *   1. SupabaseService.getUser()       → User (ou null = sem sessão)
   *   2. AuthService._carregarPerfil(id) → perfil fresco da tabela profiles
   *   3a. user presente → AppState.login(user, perfil)   — isLogado=true
   *   3b. user ausente  → AppState.logout()              — limpa estado
   *
   * @returns {Promise<{ user: object|null, perfil: object|null }>}
   *
   * @example
   *   const { user, perfil } = await UserService.refresh();
   *   if (!user) App.nav('login');
   */
  async function refresh() {
    if (typeof AppState === 'undefined' || typeof SupabaseService === 'undefined') {
      return { user: null, perfil: null };
    }

    try {
      const user = await SupabaseService.getUser();

      if (!user) {
        AppState.logout();
        return { user: null, perfil: null };
      }

      const perfil = typeof AuthService !== 'undefined'
        ? await AuthService._carregarPerfil(user.id)
        : null;

      AppState.login(user, perfil);
      return { user, perfil };
    } catch (e) {
      console.warn('[UserService] refresh falhou:', e?.message);
      return { user: AppState.getUser(), perfil: AppState.get('perfil') };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PROTEÇÃO — controle de acesso
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica autenticação e redireciona para 'login' se necessário.
   * Contrato: síncrono, zero rede — lê AppState.get('isLogado').
   * Delega ao AuthGuard (fonte única da regra).
   *
   * @param {Router} router — instância do app (App ou Pro)
   * @returns {boolean} true = autenticado | false = bloqueado e redirecionado
   *
   * @example
   *   if (!UserService.requireAuth(App)) return;
   */
  function requireAuth(router) {
    if (typeof AuthGuard !== 'undefined') return AuthGuard.requireAuth(router);
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    if (!logado && router && typeof router.push === 'function') router.push('login');
    return logado;
  }

  // ═══════════════════════════════════════════════════════════
  // PROTEÇÃO — controle de acesso
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica autenticação e redireciona para 'login' se necessário.
   * Contrato: síncrono, zero rede — lê AppState.get('isLogado').
   * Delega ao AuthGuard (fonte única da regra).
   *
   * @param {Router} router — instância do app (App ou Pro)
   * @returns {boolean} true = autenticado | false = bloqueado e redirecionado
   *
   * @example
   *   if (!UserService.requireAuth(App)) return;
   */
  function requireAuth(router) {
    if (typeof AuthGuard !== 'undefined') return AuthGuard.requireAuth(router);
    const logado = typeof AppState !== 'undefined' && AppState.get('isLogado') === true;
    if (!logado && router && typeof router.push === 'function') router.push('login');
    return logado;
  }

  // ═══════════════════════════════════════════════════════════
  // IDENTIDADE — leitura semântica do estado do usuário
  // Fonte única de verdade — nenhum outro módulo acessa AppState/AuthService diretamente.
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna true se o usuário está autenticado.
   * Contrato: NUNCA faz rede. Lê AppState.get('isLogado').
   * @returns {boolean}
   *
   * @example
   *   if (!UserService.isLogged()) return;
   */
  function isLogged() {
    if (typeof AppState === 'undefined') return false;
    return AppState.get('isLogado') === true;
  }

  /**
   * Retorna o ID do usuário corrente ou null.
   * Contrato: NUNCA faz rede.
   * @returns {string|null}
   */
  function getUserId() {
    if (typeof AppState === 'undefined') return null;
    return AppState.getUserId();
  }

  /**
   * Retorna o role do usuário corrente ('client' | 'professional' | null).
   * Contrato: NUNCA faz rede — lê o perfil em cache.
   * @returns {'client'|'professional'|null}
   *
   * @example
   *   const role = UserService.getRole(); // 'client' | 'professional' | null
   */
  function getRole() {
    if (typeof AppState === 'undefined') return null;
    return AppState.getRole();
  }

  /**
   * Retorna true se o usuário logado é profissional.
   * Contrato: NUNCA faz rede.
   * @returns {boolean}
   *
   * @example
   *   if (UserService.isProfessional()) mostrarPainelPro();
   */
  function isProfessional() {
    return getRole() === 'professional';
  }

  /**
   * Retorna true se o usuário logado é cliente.
   * Contrato: NUNCA faz rede.
   * @returns {boolean}
   *
   * @example
   *   if (UserService.isClient()) mostrarAgendamento();
   */
  function isClient() {
    return getRole() === 'client';
  }

  return Object.freeze({
    // CACHE
    getUser, getPerfil,
    // IDENTIDADE
    isLogged, getUserId, getRole, isProfessional, isClient,
    // REDE
    fetchUser, refresh,
    // PROTEÇÃO
    requireAuth,
  });
})();
