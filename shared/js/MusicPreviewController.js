'use strict';

// =============================================================
// MusicPreviewController.js — orquestra a UI de play/preview na lista.
//
// Liga o ▶/⏸ + rótulo de tempo (mm:ss / mm:ss) de cada item ao
// MusicPlayerService, e o [Usar] ao MusicSelectionController.
// Atualiza ícone/tempo do item em reprodução via onProgress/onState.
// =============================================================

class MusicPreviewController {
  #player;
  #selection;
  #state;
  #listEl = null;

  constructor({ player = null, selection = null, state = null } = {}) {
    this.#player = player;
    this.#selection = selection;
    this.#state = state;
  }

  setPlayer(player) { this.#player = player; }
  setLista(el)      { this.#listEl = el; }

  /** ▶/⏸ de uma faixa (toca uma por vez; toggle na mesma). */
  togglePlay(track) {
    this.#player?.alternar(track);
    this.#sincronizar();
  }

  /** [Usar] de uma faixa. */
  usar(track) {
    const sel = this.#selection?.usar(track);
    this.#sincronizar();
    return sel;
  }

  /** Recebe o progresso do player e atualiza o item tocando. */
  atualizarProgresso({ id, currentTime, duration, playing } = {}) {
    if (!this.#listEl || !id) return;
    const item = this.#item(id);
    if (!item) return;
    const tempo = item.querySelector?.('.sc-music-time');
    if (tempo) tempo.textContent = `${MusicPreviewController.fmtTempo(currentTime)} / ${MusicPreviewController.fmtTempo(duration)}`;
    this.#sincronizar(playing);
  }

  atualizarEstado() { this.#sincronizar(); }

  /** Atualiza os ícones ▶/⏸ conforme o player. */
  #sincronizar() {
    if (!this.#listEl) return;
    const cur = this.#player?.currentId;
    const tocando = !!this.#player?.tocando;
    [...(this.#listEl.querySelectorAll?.('.sc-music-play') ?? [])].forEach((b) => {
      const on = tocando && b.dataset.musicId === cur;
      b.textContent = on ? '⏸' : '▶';
      b.classList.toggle('is-playing', on);
    });
  }

  #item(id) {
    return [...(this.#listEl.querySelectorAll?.('.sc-music-item') ?? [])]
      .find(el => el.dataset?.musicId === id) ?? null;
  }

  static fmtTempo(seg) {
    const s = Math.max(0, Math.round(Number(seg) || 0));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPreviewController };
}
