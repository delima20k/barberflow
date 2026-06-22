'use strict';

// =============================================================
// MusicStateManager.js — coordena Preview → Confirmar → Persistir.
//
// Usa MusicPlaybackState (preview em memória) + MusicRepository
// (persistência da REFERÊNCIA de 4 campos, validada). Não toca em
// áudio/URL — a faixa do catálogo só alimenta o preview.
// =============================================================

class MusicStateManager {
  #state;
  #repo;

  /**
   * @param {object} deps
   * @param {object} deps.state — MusicPlaybackState
   * @param {object} deps.repository — MusicRepository
   */
  constructor({ state, repository } = {}) {
    this.#state = state;
    this.#repo = repository;
  }

  /** Preview (sem persistir): marca a faixa como em preview. */
  preview(track) {
    this.#state?.aplicarPreview(track);
    return track;
  }

  /**
   * Confirmar [Usar]: marca seleção/preview e PERSISTE só a referência
   * (4 campos, validada pelo MusicRepository). Retorna a ref salva.
   */
  confirmar(track) {
    if (!track) return null;
    this.#state?.selecionar(track);
    this.#state?.aplicarPreview(track);
    return this.#repo?.salvar(track) ?? null;
  }

  /** Cancelar: limpa preview e remove a referência persistida. */
  cancelar() {
    this.#state?.limpar();
    this.#repo?.limpar();
  }

  /** Referência persistida (4 campos) ou null. */
  selecionada() { return this.#repo?.obter() ?? null; }

  emPreview() { return this.#state?.previewMusic ?? null; }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicStateManager };
}
