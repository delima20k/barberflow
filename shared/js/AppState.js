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

  // Validadores por chave — garantem tipo e formato antes de gravar no estado
  static #VALIDADORES = Object.freeze({
    user:     v => v === null || (typeof v === 'object' && typeof v.id === 'string'),
    perfil:   v => v === null || typeof v === 'object',
    isLogado: v => typeof v === 'boolean',
    geo:      v => v === null || (typeof v === 'object' && typeof v.lat === 'number' && typeof v.lng === 'number'),
  });

  // Mapa de chave → array de callbacks
  static #listeners = new Map();

  // Listeners globais — notificados em qualquer mudança de estado
  static #globalListeners = [];

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

  /**
   * Valida o tipo/formato do valor para a chave informada.
   * @param {string} key
   * @param {*} value
   * @throws {TypeError} se o valor não for compatível com o schema
   * @private
   */
  static #validarValor(key, value) {
    const validar = AppState.#VALIDADORES[key];
    if (validar && !validar(value)) {
      throw new TypeError(
        `[AppState] Valor inválido para "${key}": ${JSON.stringify(value)}`
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
   *
   * Prefira os setters semânticos (setUser, setPerfil, setGeo) para maior clareza.
   * Este método permanece disponível para compatibilidade com código existente.
   *
   * @param {'user'|'perfil'|'isLogado'|'geo'} key
   * @param {*} value
   */
  static set(key, value) {
    AppState.#validarChave(key);
    AppState.#validarValor(key, value);
    AppState.#state = { ...AppState.#state, [key]: value };
    // Notifica listeners específicos da chave
    const cbs = AppState.#listeners.get(key) ?? [];
    cbs.forEach(cb => {
      try { cb(value); } catch (e) { console.warn('[AppState] Erro em listener:', e?.message); }
    });
    // Notifica listeners globais — recebem { key, value, state }
    const snap = AppState.#state;
    AppState.#globalListeners.forEach(cb => {
      try { cb({ key, value, state: snap }); } catch (e) { console.warn('[AppState] Erro em listener global:', e?.message); }
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

  /**
   * Registra um listener global — notificado a cada mudança em QUALQUER chave.
   * Recebe um objeto { key, value, state } com snapshot imutável do estado atual.
   * Retorna função de unsubscribe para evitar memory leaks.
   *
   * @param {function({ key: string, value: *, state: object }): void} callback
   * @returns {function(): void} unsubscribe
   *
   * @example
   *   const off = AppState.onAny(({ key, value }) => {
   *     console.log(`[AppState] ${key} →`, value);
   *   });
   *   // remover quando não precisar mais:
   *   off();
   */
  static onAny(callback) {
    AppState.#globalListeners.push(callback);
    return function unsubscribe() {
      const idx = AppState.#globalListeners.indexOf(callback);
      if (idx !== -1) AppState.#globalListeners.splice(idx, 1);
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SETTERS SEMÂNTICOS — interface preferida para escrita
  // Delegam para set() — validação roda em um único lugar.
  // ═══════════════════════════════════════════════════════════

  /**
   * Define o Supabase User corrente.
   * @param {object|null} user — deve ter propriedade `id` (string) ou ser null
   */
  static setUser(user)       { AppState.set('user', user); }

  /**
   * Define o perfil da tabela profiles.
   * @param {object|null} perfil — objeto ou null
   */
  static setPerfil(perfil)   { AppState.set('perfil', perfil); }

  /**
   * Define a flag de autenticação.
   * Prefira login() / logout() para operações completas de sessão.
   * @param {boolean} isLogado
   */
  static setAuth(isLogado)   { AppState.set('isLogado', isLogado); }

  /**
   * Define as coordenadas geográficas.
   * @param {{ lat: number, lng: number }|null} geo
   */
  static setGeo(geo)         { AppState.set('geo', geo); }

  // ═══════════════════════════════════════════════════════════
  // ALTO NÍVEL — ações semânticas de sessão
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra uma sessão autenticada de forma atômica.
   * Define user, perfil e isLogado=true em uma única operação,
   * disparando cada listener uma única vez na ordem correta.
   * @param {object} user   — objeto Supabase User
   * @param {object} perfil — linha da tabela profiles
   */
  static login(user, perfil) {
    AppState.set('user',     user);
    AppState.set('perfil',   perfil);
    AppState.set('isLogado', true);
  }

  /**
   * Encerra a sessão e limpa todo o estado.
   * Alias semântico de clear() — prefira este em toda lógica de logout.
   */
  static logout() {
    AppState.clear();
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
   * Retorna o ID do usuário corrente (ou null se não logado).
   * Atalho para AppState.getUser()?.id — evita encadeamento espalhado.
   * @returns {string|null}
   */
  static getUserId() {
    return AppState.#state.user?.id ?? null;
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
