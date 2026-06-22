'use strict';

// =============================================================
// AudioPreviewPlayer.js — player de PRÉVIA de música (cliente).
//
// Mantém UM ÚNICO elemento Audio reutilizado: tocar outra faixa
// para a anterior. Evita memória crescente (não acumula <audio>).
//
// AudioCtor injetável p/ teste (sem DOM real).
// =============================================================

class AudioPreviewPlayer {
  #AudioCtor;
  #audio = null;
  #urlAtual = null;
  #tocando = false;
  #volume = 1;
  #preload;
  #onChange;
  #onTime;

  /**
   * @param {object} [opts]
   * @param {Function} [opts.AudioCtor] — construtor de Audio (default global Audio)
   * @param {string} [opts.preload='none'] — preload leve (só baixa a faixa tocada)
   * @param {(estado:{url:string|null,tocando:boolean})=>void} [opts.onChange]
   * @param {(t:{currentTime:number,duration:number})=>void} [opts.onTime]
   */
  constructor({ AudioCtor = (typeof Audio !== 'undefined' ? Audio : null), preload = 'none', onChange = () => {}, onTime = () => {} } = {}) {
    this.#AudioCtor = AudioCtor;
    this.#preload = preload;
    this.#onChange = typeof onChange === 'function' ? onChange : () => {};
    this.#onTime = typeof onTime === 'function' ? onTime : () => {};
  }

  get url()         { return this.#urlAtual; }
  get tocando()     { return this.#tocando; }
  get volume()      { return this.#volume; }
  get currentTime() { return this.#audio ? (Number(this.#audio.currentTime) || 0) : 0; }
  get duration()    { const d = this.#audio ? Number(this.#audio.duration) : 0; return Number.isFinite(d) ? d : 0; }

  set currentTime(v) {
    if (!this.#audio) return;
    const tempo = Number(v);
    if (!Number.isFinite(tempo) || tempo < 0) return;
    try { this.#audio.currentTime = tempo; } catch (_) {}
  }

  set volume(v) {
    const vol = Math.min(1, Math.max(0, Number(v)));
    this.#volume = Number.isFinite(vol) ? vol : 1;
    if (this.#audio) this.#audio.volume = this.#volume;
  }

  /** Toca `url`; se já estiver tocando a mesma, pausa (toggle). */
  alternar(url) {
    if (!url || !this.#AudioCtor) return false;
    if (this.#tocando && this.#urlAtual === url) { this.parar(); return false; }
    return this.tocar(url);
  }

  tocar(url) {
    if (!url || !this.#AudioCtor) return false;
    if (!this.#audio) {
      this.#audio = new this.#AudioCtor();
      try { this.#audio.preload = this.#preload; } catch (_) {}
      this.#audio.addEventListener?.('ended', () => this.#setEstado(this.#urlAtual, false));
      this.#audio.addEventListener?.('timeupdate', () => this.#emitTime());
      this.#audio.addEventListener?.('loadedmetadata', () => this.#emitTime());
    }
    if (this.#urlAtual !== url) {
      try { this.#audio.pause?.(); } catch (_) {}
      this.#audio.src = url;
      this.#urlAtual = url;
    }
    this.#audio.volume = this.#volume;
    try { const p = this.#audio.play?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    this.#setEstado(url, true);
    return true;
  }

  /** Pausa sem perder a posição (alias semântico de parar). */
  pausar() { this.parar(); }

  parar() {
    if (this.#audio) {
      try { this.#audio.pause?.(); } catch (_) {}
    }
    this.#setEstado(this.#urlAtual, false);
  }

  /** Libera o recurso (chamar ao fechar a modal). */
  destruir() {
    if (this.#audio) {
      try { this.#audio.pause?.(); } catch (_) {}
      try { this.#audio.src = ''; } catch (_) {}
    }
    this.#audio = null;
    this.#urlAtual = null;
    this.#setEstado(null, false);
  }

  #emitTime() {
    try { this.#onTime({ currentTime: this.currentTime, duration: this.duration }); } catch (_) {}
  }

  #setEstado(url, tocando) {
    this.#urlAtual = url;
    this.#tocando = tocando;
    try { this.#onChange({ url, tocando }); } catch (_) {}
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioPreviewPlayer };
}
