'use strict';

// =============================================================
// MusicCopyrightOverlay.js — componente visual dos creditos.
//
// Cria um unico no DOM, atualiza apenas textContent e pode ser reanexado
// quando o container visual da modal mudar.
// =============================================================

class MusicCopyrightOverlay {
  #container;
  #document;
  #el = null;
  #text = '';

  constructor({ container = null, documentRef = (typeof document !== 'undefined' ? document : null) } = {}) {
    this.#container = container;
    this.#document = documentRef;
  }

  render(text) {
    const value = String(text ?? '').trim();
    if (!value || !this.#container || !this.#document) return null;
    this.#ensureEl();
    if (this.#el.parentNode !== this.#container) this.#container.appendChild(this.#el);
    this.update(value);
    return this.#el;
  }

  update(text) {
    const value = String(text ?? '').trim();
    if (!value) { this.destroy(); return null; }
    this.#ensureEl();
    if (this.#text !== value) {
      this.#text = value;
      this.#el.textContent = value;
    }
    return this.#el;
  }

  reattach(container) {
    if (container) this.#container = container;
    if (this.#el && this.#container && this.#el.parentNode !== this.#container) {
      this.#container.appendChild(this.#el);
    }
    return this.#el;
  }

  destroy() {
    this.#el?.remove?.();
    this.#el = null;
    this.#text = '';
  }

  get element() { return this.#el; }

  #ensureEl() {
    if (this.#el) return;
    this.#el = this.#document.createElement('div');
    this.#el.className = 'sc-music-copyright-overlay';
    this.#el.setAttribute('role', 'note');
    this.#el.setAttribute('aria-live', 'polite');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicCopyrightOverlay };
}
