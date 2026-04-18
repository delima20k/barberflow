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

  // Mapa de chave → array de callbacks
  static #listeners = new Map();

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Lê o valor atual de uma chave.
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @returns {*}
   */
  static get(key) {
    return AppState.#state[key];
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Atualiza uma chave e notifica todos os assinantes registrados para ela.
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @param {*} value
   */
  static set(key, value) {
    AppState.#state[key] = value;
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
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @param {function(*): void} callback
   */
  static on(key, callback) {
    if (!AppState.#listeners.has(key)) AppState.#listeners.set(key, []);
    AppState.#listeners.get(key).push(callback);
  }

  /**
   * Atalho — observa mudanças no estado de autenticação (isLogado).
   * @param {function(boolean): void} callback
   */
  static onAuth(callback) {
    AppState.on('isLogado', callback);
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
