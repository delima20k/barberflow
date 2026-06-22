'use strict';

// =============================================================
// MusicPlaybackState.js — estado de seleção/preview de música.
//
// Estado puro (sem DOM, sem rede). Guarda a faixa selecionada, a
// faixa em preview, a duração do preview (≤30s) e o progresso atual.
// Persiste enquanto a modal viver; "limpar()" é o cancelar.
// =============================================================

class MusicPlaybackState {
  static MAX_PREVIEW = 30; // segundos

  #selectedMusic = null;
  #previewMusic  = null;
  #previewDuration = 0;
  #playing = false;
  #currentTime = 0;
  #duration = 0;
  #currentId = null;

  get selectedMusic()   { return this.#clone(this.#selectedMusic); }
  get previewMusic()    { return this.#clone(this.#previewMusic); }
  get previewDuration() { return this.#previewDuration; }
  get playing()         { return this.#playing; }
  get currentTime()     { return this.#currentTime; }
  get duration()        { return this.#duration; }
  get currentId()       { return this.#currentId; }
  get temSelecao()      { return !!this.#selectedMusic; }

  /** Marca a faixa como selecionada ([Usar]). */
  selecionar(track) {
    this.#selectedMusic = this.#clone(track);
    return this.#selectedMusic;
  }

  /** Define a faixa em preview e a duração do preview (cap em 30s). */
  aplicarPreview(track) {
    this.#previewMusic = this.#clone(track);
    const d = Number(track?.duration) || MusicPlaybackState.MAX_PREVIEW;
    this.#previewDuration = Math.min(MusicPlaybackState.MAX_PREVIEW, Math.max(0, d));
    return this.#previewDuration;
  }

  /** Cancelar: remove seleção e preview. */
  limpar() {
    this.#selectedMusic = null;
    this.#previewMusic = null;
    this.#previewDuration = 0;
    this.#playing = false;
    this.#currentTime = 0;
    this.#duration = 0;
    this.#currentId = null;
  }

  /** Atualiza progresso/estado de reprodução. */
  setProgresso({ currentTime = 0, duration = 0, playing = this.#playing, id = this.#currentId } = {}) {
    this.#currentTime = Math.max(0, Number(currentTime) || 0);
    const d = Number(duration) || 0;
    this.#duration = Number.isFinite(d) ? d : 0;
    this.#playing = !!playing;
    this.#currentId = id ?? null;
  }

  toJSON() {
    return {
      selectedMusic: this.selectedMusic,
      previewMusic: this.previewMusic,
      previewDuration: this.#previewDuration,
      playing: this.#playing,
      currentTime: this.#currentTime,
      duration: this.#duration,
      currentId: this.#currentId,
    };
  }

  #clone(o) { return o ? { ...o } : null; }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPlaybackState };
}
