'use strict';

// =============================================================
// MusicSelectionController.js — seleção/cancelamento de música.
//
// usar(track):    confirma via MusicStateManager (persiste só a REFERÊNCIA
//                 validada — 4 campos) + aplica preview (toca sobre o preview).
// cancelar():     remove seleção/preview (via manager) e para a música.
// A referência persiste no estado do editor ao fechar a modal.
// =============================================================

class MusicSelectionController {
  #manager;
  #player;
  #onAplicar;
  #onCancelar;

  /**
   * @param {object} deps
   * @param {object} deps.stateManager — MusicStateManager (confirmar/cancelar/selecionada)
   * @param {object} deps.player       — MusicPlayerService
   * @param {(track:object)=>void} [deps.onAplicar]  — hook UI (mostra mix, ajusta volumes)
   * @param {()=>void} [deps.onCancelar]
   */
  constructor({ stateManager, player, onAplicar = () => {}, onCancelar = () => {} } = {}) {
    this.#manager = stateManager;
    this.#player = player;
    this.#onAplicar = typeof onAplicar === 'function' ? onAplicar : () => {};
    this.#onCancelar = typeof onCancelar === 'function' ? onCancelar : () => {};
  }

  get selecionada() { return this.#manager?.selecionada() ?? null; }

  /** [Usar]: confirma (persiste a referência validada) e aplica o preview. */
  usar(track) {
    if (!track) return null;
    let ref = null;
    try {
      ref = this.#manager?.confirmar(track); // valida + persiste só 4 campos
    } catch (_) {
      return null; // referência inválida/insegura — ignora (não quebra a UI)
    }
    this.#onAplicar(track);        // UI: revela mix, ajusta volumes do preview
    this.#player?.tocar(track);    // aplica o preview: música sobre o vídeo/imagem
    return ref;
  }

  /** Cancelar: remove a seleção/preview e para a música. */
  cancelar() {
    this.#player?.pausar();
    this.#manager?.cancelar();
    this.#onCancelar();
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicSelectionController };
}
