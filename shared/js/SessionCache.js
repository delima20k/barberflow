'use strict';

// =============================================================
// SessionCache.js — Persistência local de sessão e avatar
// Mantém o usuário logado e o avatar visível mesmo após
// fechar o app, atualizar a página ou sair e voltar.
//
// Estratégia:
//   1. Supabase já guarda o token em localStorage (getSession é rápido)
//   2. SessionCache guarda perfil + avatar_url → UI instantânea ao abrir
//   3. Em background, a sessão é validada com o servidor
//
// Dependência: nenhuma (usa apenas localStorage)
// =============================================================

class SessionCache {

  // ── Namespace separado por app para evitar colisão no mesmo origem ──
  static get #ns() {
    return window.location.pathname.includes('/profissional/') ? 'bf_p' : 'bf_c';
  }

  static get #K_PERFIL() { return `${SessionCache.#ns}_perfil`;     }
  static get #K_USER()   { return `${SessionCache.#ns}_user`;       }
  static get #K_AVATAR() { return `${SessionCache.#ns}_avatar_url`; }

  // ═══════════════════════════════════════════════════════════
  // SALVAR
  // ═══════════════════════════════════════════════════════════

  /**
   * Persiste perfil + dados básicos do usuário.
   * Chamado após login ou refresh de sessão bem-sucedido.
   * @param {object|null} perfil
   * @param {object|null} user   — objeto Supabase User
   */
  static salvar(perfil, user) {
    try {
      if (perfil) localStorage.setItem(SessionCache.#K_PERFIL, JSON.stringify(perfil));
      if (user)   localStorage.setItem(SessionCache.#K_USER,   JSON.stringify({
        id:    user.id,
        email: user.email,
      }));
    } catch (_) { /* localStorage indisponível (modo privado extremo) */ }
  }

  /**
   * Persiste a URL pública do avatar para exibição imediata no próximo load.
   * @param {string} url — URL pública do Storage
   */
  static salvarAvatar(url) {
    try { if (url) localStorage.setItem(SessionCache.#K_AVATAR, url); } catch (_) {}
  }

  /**
   * Salva os dados extras do perfil (endereço, nascimento, sexo, CEP)
   * localmente por user ID — sem custo de escrita no Supabase.
   * @param {string} userId
   * @param {object} dados  — campos extras { address, birth_date, gender, zip_code }
   */
  static salvarExtras(userId, dados) {
    if (!userId || !dados) return;
    try {
      const chave   = `${SessionCache.#ns}_extra_${userId}`;
      const atual   = SessionCache.getExtras(userId) || {};
      const merged  = { ...atual, ...dados };
      localStorage.setItem(chave, JSON.stringify(merged));
    } catch (_) {}
  }

  /**
   * Lê os dados extras do perfil do localStorage.
   * @param {string} userId
   * @returns {object|null}
   */
  static getExtras(userId) {
    if (!userId) return null;
    try {
      const chave = `${SessionCache.#ns}_extra_${userId}`;
      return JSON.parse(localStorage.getItem(chave) ?? 'null');
    } catch (_) { return null; }
  }

  /**
   * Remove extras do perfil (chamado no logout).
   * @param {string} userId
   */
  static limparExtras(userId) {
    if (!userId) return;
    try {
      localStorage.removeItem(`${SessionCache.#ns}_extra_${userId}`);
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════
  // RESTAURAR
  // ═══════════════════════════════════════════════════════════

  /**
   * Lê sessão do localStorage de forma síncrona (sem rede).
   * @returns {{ perfil: object|null, user: object|null }}
   */
  static restaurar() {
    try {
      return {
        perfil: JSON.parse(localStorage.getItem(SessionCache.#K_PERFIL) ?? 'null'),
        user:   JSON.parse(localStorage.getItem(SessionCache.#K_USER)   ?? 'null'),
      };
    } catch (_) { return { perfil: null, user: null }; }
  }

  /**
   * Retorna a URL do avatar em cache (ou null se nunca salvo).
   * @returns {string|null}
   */
  static getAvatar() {
    try { return localStorage.getItem(SessionCache.#K_AVATAR) ?? null; } catch (_) { return null; }
  }

  // ═══════════════════════════════════════════════════════════
  // LIMPAR
  // ═══════════════════════════════════════════════════════════

  /**
   * Remove todos os dados da sessão, incluindo o avatar.
   * Use no logout explícito (clique em "Sair").
   */
  static limparTudo() {
    try {
      [SessionCache.#K_PERFIL, SessionCache.#K_USER, SessionCache.#K_AVATAR]
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  /**
   * Remove apenas perfil e user, mantendo o avatar em cache.
   * Use quando a sessão expirar silenciosamente (token inválido).
   */
  static limpar() {
    try {
      localStorage.removeItem(SessionCache.#K_PERFIL);
      localStorage.removeItem(SessionCache.#K_USER);
    } catch (_) {}
  }
}
