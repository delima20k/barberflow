'use strict';

class YouTubeVideoController {
  #root;
  #videoId;
  #loadButton;
  #frame;

  constructor(root, videoId = '') {
    this.#root = root;
    this.#videoId = YouTubeVideoController.normalizeVideoId(videoId);
    this.#loadButton = root?.querySelector('[data-load-video]') ?? null;
    this.#frame = null;
    this.handleLoad = this.handleLoad.bind(this);
  }

  init() {
    if (!this.#root) return this;

    if (!this.#videoId) {
      this.#root.dataset.videoState = 'unavailable';
      return this;
    }

    this.#root.dataset.videoState = 'ready';
    this.#root.querySelector('[data-video-title]').textContent = 'Apresentação disponível';
    this.#root.querySelector('[data-video-description]').textContent =
      'Carregue o vídeo quando estiver pronto para assistir.';
    this.#loadButton.hidden = false;
    this.#loadButton.addEventListener('click', this.handleLoad);
    return this;
  }

  handleLoad() {
    if (this.#frame || !this.#videoId) return;

    const frame = this.#root.ownerDocument.createElement('iframe');
    frame.className = 'video-player__frame';
    frame.src = `https://www.youtube-nocookie.com/embed/${this.#videoId}?rel=0`;
    frame.title = 'Apresentação do BarberFlow';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    this.#frame = frame;
    this.#root.replaceChildren(frame);
    this.#root.dataset.videoState = 'loaded';
  }

  destroy() {
    this.#loadButton?.removeEventListener('click', this.handleLoad);
    if (this.#frame) this.#frame.src = 'about:blank';
    this.#frame = null;
  }

  static normalizeVideoId(value) {
    const videoId = String(value ?? '').trim();
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : '';
  }
}

globalThis.YouTubeVideoController = YouTubeVideoController;
