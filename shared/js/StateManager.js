'use strict';

// =============================================================
// StateManager.js — Gerenciamento de contexto ativo
//
// Responsabilidade única: rastrear o contexto atual da aplicação
// (ex: qual barbearia está aberta) e coordenar a limpeza de cache
// e cache-busting de recursos ao trocar de contexto.
//
// Ao chamar setCurrentContext(id) com um id diferente do atual:
//   1. CacheManager.clearScope(idAnterior) — invalida dados do contexto antigo
//   2. ResourceLoader.invalidateBust()      — força novo timestamp nas URLs
//
// Dependências: CacheManager.js, ResourceLoader.js
// =============================================================

class StateManager {

  static #context = null;

  // ══════════════════════════════════════════════════════════
  // CONTEXTO
  // ══════════════════════════════════════════════════════════

  /**
   * Define o contexto ativo. Se o contexto mudou, invalida o cache
   * do contexto anterior e renova o cache-bust de recursos.
   * @param {string|null} contextId
   */
  static setCurrentContext(contextId) {
    const anterior = StateManager.#context;
    if (anterior === contextId) return;

    // Invalida dados do contexto anterior antes de trocar
    if (anterior !== null) {
      CacheManager.clearScope(anterior);
    }

    StateManager.#context = contextId;

    // Força novas URLs para imagens e vídeos do novo contexto
    ResourceLoader.invalidateBust();
  }

  /**
   * Retorna o contexto ativo atual.
   * @returns {string|null}
   */
  static getCurrentContext() {
    return StateManager.#context;
  }

  /**
   * Reseta o contexto para null (ex: ao sair da tela de barbearia).
   */
  static resetState() {
    StateManager.#context = null;
  }

  /**
   * Verifica se o id fornecido difere do contexto atual.
   * Útil para stale-check após awaits assíncronos.
   * @param {string|null} contextId
   * @returns {boolean}
   */
  static isContextChanged(contextId) {
    return StateManager.#context !== contextId;
  }
}
