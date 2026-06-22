'use strict';

// =============================================================
// MusicPlayerService.js — política de playback de PRÉVIA de música.
//
// REUTILIZA o AudioPreviewPlayer (um único <audio>) e adiciona:
//   • tocar uma faixa por vez (para a anterior);
//   • preview limitado a `maxSeconds` (30s) — para ao atingir;
//   • progresso (currentTime/duration/playing) via onProgress;
//   • preload leve (não baixa o catálogo inteiro).
//
// Em node (testes) resolve o AudioPreviewPlayer via require; no browser
// usa o global carregado antes deste script.
// =============================================================

class MusicPlayerService {
  #player;
  #maxSeconds;
  #onProgress;
  #onState;
  #currentTrack = null;

  /**
   * @param {object} [opts]
   * @param {object} [opts.player] — AudioPreviewPlayer já pronto (senão cria um)
   * @param {Function} [opts.AudioCtor] — repassado ao AudioPreviewPlayer (testes)
   * @param {number} [opts.maxSeconds=30]
   * @param {(p:{id,currentTime,duration,playing})=>void} [opts.onProgress]
   * @param {(s:{id,playing})=>void} [opts.onState]
   */
  constructor({ player = null, AudioCtor, maxSeconds = 30, onProgress = () => {}, onState = () => {} } = {}) {
    this.#maxSeconds = Number(maxSeconds) > 0 ? Number(maxSeconds) : 30;
    this.#onProgress = typeof onProgress === 'function' ? onProgress : () => {};
    this.#onState    = typeof onState === 'function' ? onState : () => {};

    const APP = MusicPlayerService.#resolverPlayer();
    this.#player = player || (APP ? new APP({
      AudioCtor, preload: 'none',
      onChange: ({ tocando }) => this.#onState({ id: this.#currentTrack?.music_id ?? null, playing: tocando }),
      onTime: ({ currentTime, duration }) => this.#progresso(currentTime, duration),
    }) : null);
  }

  get tocando()     { return !!this.#player?.tocando; }
  get currentId()   { return this.#currentTrack?.music_id ?? null; }
  get currentTrack(){ return this.#currentTrack ? { ...this.#currentTrack } : null; }

  set volume(v) { if (this.#player) this.#player.volume = v; }
  get volume()  { return this.#player ? this.#player.volume : 1; }

  /** Toca a faixa (uma por vez). */
  tocar(track) {
    if (!track || !track.url || !this.#player) return false;
    this.#currentTrack = track;
    return this.#player.tocar(track.url);
  }

  /** Toggle: mesma faixa tocando → pausa; senão toca. */
  alternar(track) {
    if (!track || !track.url || !this.#player) return false;
    if (this.tocando && this.currentId === track.music_id) { this.pausar(); return false; }
    return this.tocar(track);
  }

  pausar() { this.#player?.parar(); }

  destruir() { this.#player?.destruir(); this.#currentTrack = null; }

  #progresso(currentTime, duration) {
    const cap = this.#maxSeconds;
    // Para o preview ao atingir o limite (30s).
    if (currentTime >= cap) { this.pausar(); }
    const limite = Math.min(cap, Number(this.#currentTrack?.duration) || cap);
    this.#onProgress({
      id: this.#currentTrack?.music_id ?? null,
      currentTime: Math.min(currentTime, cap),
      duration: limite,
      playing: this.tocando,
    });
  }

  static #resolverPlayer() {
    if (typeof AudioPreviewPlayer !== 'undefined') return AudioPreviewPlayer;
    if (typeof require !== 'undefined') {
      try { return require('./AudioPreviewPlayer').AudioPreviewPlayer; } catch (_) { /* ignore */ }
    }
    return null;
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPlayerService };
}
