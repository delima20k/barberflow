'use strict';

class YouTubeVideoController {
  #root;
  #videoId;
  #loadButton;
  #frame;
  #observer;
  #observerFactory;

  constructor(
    root,
    videoId = '',
    observerFactory = YouTubeVideoController.createVisibilityObserver,
  ) {
    this.#root = root;
    this.#videoId = YouTubeVideoController.normalizeVideoId(videoId);
    this.#loadButton = root?.querySelector('[data-load-video]') ?? null;
    this.#frame = null;
    this.#observer = null;
    this.#observerFactory = observerFactory;
    this.handleLoad = this.handleLoad.bind(this);
    this.handleIntersection = this.handleIntersection.bind(this);
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
      'O vídeo iniciará sem som quando entrar na tela. Ative o áudio no player.';
    if (this.#loadButton) {
      this.#loadButton.hidden = false;
      this.#loadButton.addEventListener('click', this.handleLoad);
    }
    this.#observer = this.#observerFactory(this.handleIntersection, {
      threshold: 0.5,
    });
    this.#observer?.observe(this.#root);
    return this;
  }

  handleLoad() {
    this.#loadVideo(true, false);
  }

  handleIntersection(entries) {
    const visibleEntry = entries.find(
      (entry) =>
        entry.target === this.#root &&
        entry.isIntersecting &&
        entry.intersectionRatio >= 0.5,
    );

    if (visibleEntry) this.#loadVideo(true, true);
  }

  #loadVideo(autoplay, muted) {
    if (this.#frame || !this.#videoId) return;

    const frame = this.#root.ownerDocument.createElement('iframe');
    const autoplayQuery = autoplay
      ? `&autoplay=1&mute=${muted ? '1' : '0'}&playsinline=1`
      : '';
    frame.className = 'video-player__frame';
    frame.src = `https://www.youtube-nocookie.com/embed/${this.#videoId}?rel=0${autoplayQuery}`;
    frame.title = 'Apresentação do BarberFlow';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    this.#frame = frame;
    this.#root.replaceChildren(frame);
    this.#root.dataset.videoState = 'loaded';
    this.#stopObserving();
  }

  destroy() {
    this.#loadButton?.removeEventListener('click', this.handleLoad);
    this.#stopObserving();
    if (this.#frame) this.#frame.src = 'about:blank';
    this.#frame = null;
  }

  #stopObserving() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  static normalizeVideoId(value) {
    const videoId = String(value ?? '').trim();
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : '';
  }

  static createVisibilityObserver(callback, options) {
    if (typeof globalThis.IntersectionObserver !== 'function') return null;
    return new globalThis.IntersectionObserver(callback, options);
  }
}

globalThis.YouTubeVideoController = YouTubeVideoController;
