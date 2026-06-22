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
  #onChange;

  /**
   * @param {object} [opts]
   * @param {Function} [opts.AudioCtor] — construtor de Audio (default global Audio)
   * @param {(estado:{url:string|null,tocando:boolean})=>void} [opts.onChange]
   */
  constructor({ AudioCtor = (typeof Audio !== 'undefined' ? Audio : null), onChange = () => {} } = {}) {
    this.#AudioCtor = AudioCtor;
    this.#onChange = typeof onChange === 'function' ? onChange : () => {};
  }

  get url()      { return this.#urlAtual; }
  get tocando()  { return this.#tocando; }
  get volume()   { return this.#volume; }

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
      this.#audio.addEventListener?.('ended', () => this.#setEstado(this.#urlAtual, false));
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
