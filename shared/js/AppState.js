'use strict';

// =============================================================
// AppState.js — Estado global da sessão do usuário.
// Singleton compartilhado entre todos os módulos da aplicação.
// Notifica assinantes quando qualquer chave de estado muda.
//
// Uso:
//   AppState.set('isLogado', true);
//   AppState.get('perfil');
//   AppState.onAuth(cb);  // alias para on('isLogado', cb)
//   AppState.clear();     // chamado no logout
// =============================================================

// Armazena e distribui o estado global do usuário (sessão, perfil, geolocalização).
class AppState {

  // Estado interno (imutável externamente)
  static #state = {
    user:     null,   // objeto Supabase User
    perfil:   null,   // objeto da tabela profiles
    isLogado: false,  // boolean
    geo:      null,   // { lat, lng } ou null
  };

  // Chaves válidas — qualquer outra lança TypeError imediatamente
  static #CHAVES = Object.freeze(new Set(['user', 'perfil', 'isLogado', 'geo']));

  // Mapa de chave → array de callbacks
  static #listeners = new Map();

  /**
   * Valida se a chave pertence ao schema permitido.
   * @param {string} key
   * @throws {TypeError} se a chave for inválida
   * @private
   */
  static #validarChave(key) {
    if (!AppState.#CHAVES.has(key)) {
      throw new TypeError(
        `[AppState] Chave inválida: "${key}". Permitidas: ${[...AppState.#CHAVES].join(', ')}.`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Lê o valor atual de uma chave.
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @returns {*}
   */
  static get(key) {
    AppState.#validarChave(key);
    return AppState.#state[key];
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Atualiza uma chave produzindo um novo objeto de estado (imutabilidade).
   * Nunca muta o estado anterior — facilita rastreabilidade e evita efeitos colaterais.
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @param {*} value
   */
  static set(key, value) {
    AppState.#validarChave(key);
    AppState.#state = { ...AppState.#state, [key]: value };
    const cbs = AppState.#listeners.get(key) ?? [];
    cbs.forEach(cb => {
      try { cb(value); } catch (e) { console.warn('[AppState] Erro em listener:', e?.message); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ASSINATURAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra um callback para mudanças em uma chave específica.
   * Retorna uma função de unsubscribe — chame-a para remover o listener
   * e evitar memory leaks em componentes que são destruídos.
   *
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @param {function(*): void} callback
   * @returns {function(): void} unsubscribe
   *
   * @example
   *   const off = AppState.on('isLogado', cb);
   *   // ... quando o componente for destruído:
   *   off();
   */
  static on(key, callback) {
    AppState.#validarChave(key);
    if (!AppState.#listeners.has(key)) AppState.#listeners.set(key, []);
    AppState.#listeners.get(key).push(callback);

    return function unsubscribe() {
      const lista = AppState.#listeners.get(key);
      if (!lista) return;
      const idx = lista.indexOf(callback);
      if (idx !== -1) lista.splice(idx, 1);
    };
  }

  /**
   * Atalho — observa mudanças no estado de autenticação (isLogado).
   * Retorna unsubscribe (propagado de on()).
   * @param {function(boolean): void} callback
   * @returns {function(): void} unsubscribe
   */
  static onAuth(callback) {
    return AppState.on('isLogado', callback);
  }

  // ═══════════════════════════════════════════════════════════
  // CONVENIÊNCIA — leitura semântica do estado de sessão
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna true se o usuário está autenticado.
   * Fonte única de verdade — não duplicar em outros módulos.
   * @returns {boolean}
   */
  static isLogged() {
    return AppState.#state.isLogado === true;
  }

  /**
   * Retorna o objeto Supabase User corrente (ou null).
   * @returns {object|null}
   */
  static getUser() {
    return AppState.#state.user ?? null;
  }

  /**
   * Retorna o role do usuário corrente ('client' | 'professional' | null).
   * Lê do perfil em cache — sem chamada de rede.
   * @returns {string|null}
   */
  static getRole() {
    return AppState.#state.perfil?.role ?? null;
  }

  // ═══════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════

  /**
   * Reseta todo o estado para os valores iniciais.
   * Chamado após logout para garantir que nenhum dado vaze entre sessões.
   */
  static clear() {
    AppState.set('user',     null);
    AppState.set('perfil',   null);
    AppState.set('isLogado', false);
    AppState.set('geo',      null);
  }
}
