'use strict';

// =============================================================
// PreviewMusicController.js — orquestra creditos visuais de musica.
//
// Fluxo: selectMusic(track) -> extractMetadata(track) -> generateCredit()
// -> renderOverlay(). Mantem "last selection wins" para evitar races.
// =============================================================

class PreviewMusicController {
  static DEBOUNCE_MS = 50;

  #credits;
  #overlay;
  #timer = null;
  #selectionToken = 0;

  constructor({ creditsService, overlay } = {}) {
    const Credits = PreviewMusicController.#resolveCreditsService();
    const Overlay = PreviewMusicController.#resolveOverlay();
    this.#credits = creditsService ?? (Credits ? new Credits() : null);
    this.#overlay = overlay ?? (Overlay ? new Overlay() : null);
  }

  selectMusic(track) {
    const token = ++this.#selectionToken;
    const metadata = this.extractMetadata(track);
    const text = this.generateCredit(metadata);
    this.#clearTimer();
    if (!text) { this.#overlay?.destroy?.(); return null; }

    this.#timer = setTimeout(() => {
      if (token !== this.#selectionToken) return;
      this.renderOverlay(text);
    }, PreviewMusicController.DEBOUNCE_MS);
    return text;
  }

  extractMetadata(track = {}) {
    return {
      id: track.id ?? null,
      artist: track.artist ?? '',
      title: track.title ?? track.music_name ?? '',
      music_name: track.music_name ?? track.title ?? '',
    };
  }

  generateCredit(metadata) {
    return this.#credits?.generate?.(metadata) ?? null;
  }

  renderOverlay(text) {
    return this.#overlay?.render?.(text) ?? null;
  }

  clear() {
    this.#selectionToken += 1;
    this.#clearTimer();
    this.#overlay?.destroy?.();
  }

  destroy() { this.clear(); }

  reattach(container) {
    this.#overlay?.reattach?.(container);
  }

  get overlayElement() { return this.#overlay?.element ?? null; }

  #clearTimer() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  static #resolveCreditsService() {
    if (typeof MusicCreditsService !== 'undefined') return MusicCreditsService;
    if (typeof require === 'function') {
      try { return require('./MusicCreditsService').MusicCreditsService; } catch (_) { /* ignore */ }
    }
    return null;
  }

  static #resolveOverlay() {
    if (typeof MusicCopyrightOverlay !== 'undefined') return MusicCopyrightOverlay;
    if (typeof require === 'function') {
      try { return require('./MusicCopyrightOverlay').MusicCopyrightOverlay; } catch (_) { /* ignore */ }
    }
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PreviewMusicController };
}
