'use strict';

// =============================================================
// StoriesStore — cache em memória de stories agrupados por barbearia
//
// Evita armazenar arrays JSON em data-attributes do DOM.
// ShopId → stories[] do BFF. Acessível por StoriesWidget e StoryViewer.
// =============================================================

class StoriesStore {

  static #cache = new Map();

  static set(shopId, stories) {
    if (shopId && Array.isArray(stories)) StoriesStore.#cache.set(shopId, stories);
  }

  static get(shopId) {
    return StoriesStore.#cache.get(shopId) ?? [];
  }

  static has(shopId) {
    return StoriesStore.#cache.has(shopId);
  }

  /** Limpa o cache (ex.: ao fazer logout). */
  static clear() {
    StoriesStore.#cache.clear();
  }
}

// =============================================================
// MediaViewer — player fullscreen unificado (imagem e vídeo)
//
// Singleton. Visual espelha .pp-prism-viewer (mesmas cores, mesmo
// botão fechar) com z-index 9000 para ficar acima de qualquer painel.
// Áudio: tenta play() com som; se bloqueado exibe botão de áudio —
// nunca force-muta automaticamente.
//
// CSS: .media-viewer / .media-viewer__* (em story-cards.css)
// =============================================================

class MediaViewer {

  static #instance = null;

  #overlayEl = null;
  #videoEl   = null;
  #keyFn     = null;

  static getInstance() {
    if (!MediaViewer.#instance) MediaViewer.#instance = new MediaViewer();
    return MediaViewer.#instance;
  }

  /**
   * Abre o viewer fullscreen.
   * @param {{ type: 'video', src: string, poster?: string }} item
   */
  open({ type, src, poster = '' }) {
    if (type === 'video') this.#abrirVideo(src, poster);
  }

  /** Pausa e remove o overlay. Libera o vídeo completamente. */
  fechar() {
    if (this.#videoEl) {
      this.#videoEl.pause();
      this.#videoEl.currentTime = 0;
      this.#videoEl.removeAttribute('src');
      if (typeof this.#videoEl.load === 'function') this.#videoEl.load();
    }
    this.#overlayEl?.remove();
    this.#overlayEl = null;
    this.#videoEl   = null;
    document.body.classList.remove('media-viewer-open');
    if (this.#keyFn) {
      document.removeEventListener('keydown', this.#keyFn);
      this.#keyFn = null;
    }
  }

  // ── Privados ─────────────────────────────────────────────────

  #abrirVideo(src, poster) {
    this.fechar();

    const overlay = document.createElement('div');
    overlay.className = 'media-viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'media-viewer__close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.fechar());

    const video = document.createElement('video');
    video.className  = 'media-viewer__video';
    video.src        = src;
    video.poster     = poster;
    video.controls   = true;
    video.autoplay   = true;
    video.muted      = false;
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'auto');

    overlay.appendChild(closeBtn);
    overlay.appendChild(video);
    document.body.appendChild(overlay);
    document.body.classList.add('media-viewer-open');

    this.#overlayEl = overlay;
    this.#videoEl   = video;

    // Tenta play com som; se autoplay bloqueado → mostra botão de áudio
    video.play().catch((err) => {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        this.#mostrarBotaoSom(video);
      }
    });

    // Fechar com Escape
    this.#keyFn = (e) => { if (e.key === 'Escape') this.fechar(); };
    document.addEventListener('keydown', this.#keyFn);

    // Fechar clicando no fundo escuro
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.fechar(); });
  }

  #mostrarBotaoSom(video) {
    if (!this.#overlayEl || this.#overlayEl.querySelector('.media-viewer__sound')) return;
    const btn = document.createElement('button');
    btn.className = 'media-viewer__sound';
    btn.type = 'button';
    btn.textContent = '🔊 Tocar com som';
    btn.addEventListener('click', () => {
      video.muted = false;
      video.play().catch(() => {});
      btn.remove();
    });
    this.#overlayEl.appendChild(btn);
  }
}

// =============================================================
// StoriesWidget — carregamento dinâmico de stories agrupados por barbearia
//
// Responsabilidades:
//   - Buscar stories via BFF (GET /api/v1/barbearias/:id/stories)
//   - Modo barbearia: cria UM card para a barbearia com todos os stories no StoriesStore
//   - Modo scan: 1 card por owner, armazena todos os stories no StoriesStore,
//     sem MediaViewer — StoryViewer ativado via StoriesLayout event delegation
//   - Carregamento lazy via IntersectionObserver (threshold 10%, root=scroll)
//   - Badge contador: mostra "+N" somente se stories.length > 1
//   - Erro de vídeo: exibe ↻ retry (nunca oculta o card)
//
// Dependências: StoriesStore, BffApiService.js, MediaViewer (fallback legacy)
// =============================================================

class StoriesWidget {

  #scrollEl     = null;
  #barbershopId = null;
  #shopName     = null;
  #shopLogoSrc  = null;

  /**
   * @param {HTMLElement} scrollEl           — container .stories-scroll
   * @param {object}      [opts]
   * @param {string|null} [opts.barbershopId] — UUID da barbearia (modo rebuild)
   * @param {string|null} [opts.shopName]     — nome exibido nos cards
   * @param {string|null} [opts.shopLogoSrc]  — URL do logo para o badge do card
   */
  constructor(scrollEl, { barbershopId = null, shopName = null, shopLogoSrc = null } = {}) {
    this.#scrollEl     = scrollEl;
    this.#barbershopId = barbershopId;
    this.#shopName     = shopName;
    this.#shopLogoSrc  = shopLogoSrc;
  }

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /** Carrega e renderiza os stories. Fire-and-forget seguro. */
  async carregar() {
    if (!this.#scrollEl || typeof BffApiService === 'undefined') return;
    if (this.#barbershopId) {
      await this.#carregarPorBarbearia();
    } else {
      await this.#carregarPorCards();
    }
    this.#bindObserver();
  }

  /**
   * Convenience: cria e carrega um StoriesWidget para o scroll da home.
   * Modo scan — percorre cards existentes por data-owner-id.
   * @param {HTMLElement|null} telaInicio — elemento #tela-inicio
   */
  static iniciarHome(telaInicio) {
    const scroll = telaInicio?.querySelector?.('.stories-scroll');
    if (!scroll) return;
    new StoriesWidget(scroll).carregar().catch(() => {});
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS — carregamento
  // ══════════════════════════════════════════════════════════

  /** Modo rebuild: cria UM card para a barbearia com todos os stories. */
  async #carregarPorBarbearia() {
    const { data: stories, error } =
      await BffApiService.barbearias.listarStories(this.#barbershopId);

    if (error || !Array.isArray(stories) || !stories.length) {
      this.#ocultarSecao();
      return;
    }

    StoriesStore.set(this.#barbershopId, stories);
    this.#scrollEl.innerHTML = '';
    this.#scrollEl.appendChild(this.#criarCardGrupo(stories, this.#barbershopId));

    const section = this.#scrollEl.closest('.bp-stories-section');
    if (section) section.hidden = false;
  }

  /**
   * Modo scan: 1 card por owner, todos os stories no StoriesStore.
   * Remove bindings MediaViewer/stopPropagation — StoryViewer é ativado
   * naturalmente via StoriesLayout event delegation.
   */
  async #carregarPorCards() {
    const cards = [...this.#scrollEl.querySelectorAll('.story-card[data-owner-id]')];

    // Agrupa por ownerId, mantendo apenas o PRIMEIRO card por owner
    const primeiroCardPorOwner = new Map();
    for (const card of cards) {
      const oid = card.dataset.ownerId;
      if (!oid || oid.startsWith('00000000')) continue;
      if (!primeiroCardPorOwner.has(oid)) {
        primeiroCardPorOwner.set(oid, card);
      } else {
        card.hidden = true; // oculta card duplicado do mesmo owner
      }
    }

    if (!primeiroCardPorOwner.size) return;

    // Busca todos os stories em paralelo
    const buscas = [...primeiroCardPorOwner.keys()].map(oid =>
      BffApiService.barbearias.listarStories(oid)
        .then(({ data }) => ({ oid, stories: Array.isArray(data) ? data : [] }))
        .catch(() => ({ oid, stories: [] })),
    );

    const resultados = await Promise.all(buscas);

    for (const { oid, stories } of resultados) {
      const card = primeiroCardPorOwner.get(oid);
      if (!card) continue;

      if (!stories.length) {
        card.hidden = true;
        continue;
      }

      // Armazena todos os stories da barbearia no cache
      StoriesStore.set(oid, stories);

      // Popula thumbnail com o primeiro story
      const primeiroStory = stories[0];
      const video = card.querySelector('.story-video');
      if (video && primeiroStory?.media_url) {
        video.src     = primeiroStory.media_url;
        video.preload = 'none';
        if (primeiroStory.thumbnail_path) video.poster = primeiroStory.thumbnail_path;
      }

      // Marca com shopId (não mais storyId individual)
      card.dataset.shopId = oid;

      // Badge contador: somente se há mais de 1 story
      this.#atualizarContador(card, stories.length);

      // Sincroniza likes do viewer com o card via CustomEvent (sem acoplamento)
      const likeCountEl = card.querySelector('.story-like-count');
      if (likeCountEl) {
        card.addEventListener('story:like', (e) => {
          const { count } = e.detail ?? {};
          if (typeof count === 'number') likeCountEl.textContent = String(count);
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS — carregamento lazy e erros
  // ══════════════════════════════════════════════════════════

  /**
   * Registra IntersectionObserver no scroll para carregar vídeos sob demanda.
   * Quando o card entra na viewport: load() do metadata.
   * Quando sai: pause() (sem descarregar).
   * Fallback para browsers sem IntersectionObserver: carrega todos imediatamente.
   */
  #bindObserver() {
    if (!this.#scrollEl?.querySelectorAll) return;

    // Ignora cards ocultos (sem stories ou duplicados)
    const allCards = [...this.#scrollEl.querySelectorAll('.story-card:not([hidden])')];
    if (!allCards.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: carregar todos imediatamente
      for (const card of allCards) {
        const video = card.querySelector('.story-video');
        const wrap  = card.querySelector('.story-video-wrap');
        if (!video || !video.src) continue;
        video.preload = 'metadata';
        video.onloadedmetadata = () => wrap?.classList.add('is-loaded');
        video.onerror = () => this.#aoErrarVideo(card, video);
        if (typeof video.load === 'function') video.load();
      }
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card  = entry.target;
        const video = card.querySelector('.story-video');
        const wrap  = card.querySelector('.story-video-wrap');
        if (!video) continue;

        if (entry.isIntersecting && !video.dataset.observerBound) {
          video.dataset.observerBound = '1';
          video.preload = 'metadata';
          video.onloadedmetadata = () => wrap?.classList.add('is-loaded');
          video.onerror = () => this.#aoErrarVideo(card, video);
          if (typeof video.load === 'function') video.load();
        } else if (!entry.isIntersecting) {
          if (video.src && !video.paused) video.pause();
        }
      }
    }, { root: this.#scrollEl, threshold: 0.1 });

    for (const card of allCards) observer.observe(card);
  }

  /**
   * Trata erro de carregamento de vídeo.
   * Mantém o card visível, adiciona classe story-failed e exibe botão ↻.
   * @param {HTMLElement} card
   * @param {HTMLVideoElement} video
   */
  #aoErrarVideo(card, video) {
    card.classList.add('story-failed');
    const wrap = card.querySelector('.story-video-wrap');
    if (!wrap || wrap.querySelector('.story-retry-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'story-retry-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Tentar novamente');
    btn.textContent = '↻';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      card.classList.remove('story-failed');
      btn.remove();
      delete video.dataset.observerBound;
      const src = video.src;
      video.src = src;
      video.preload = 'metadata';
      if (typeof video.load === 'function') video.load();
    });

    wrap.appendChild(btn);
  }

  /** Oculta a section pai ou o próprio scroll se não houver section. */
  #ocultarSecao() {
    const section = this.#scrollEl.closest('.bp-stories-section');
    if (section) { section.hidden = true; return; }
    this.#scrollEl.hidden = true;
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS — construção de cards
  // ══════════════════════════════════════════════════════════

  /**
   * Cria 1 card representando TODA a barbearia (não um story individual).
   * Thumbnail = primeiro story. Badge = quantidade de stories (se > 1).
   * StoriesStore é populado aqui para que StoryViewer possa recuperar os dados.
   *
   * @param {object[]} stories — array completo retornado pelo BFF
   * @param {string|null} shopId — UUID da barbearia (fallback: stories[0].owner_id)
   * @returns {HTMLDivElement}
   */
  #criarCardGrupo(stories, shopId = null) {
    const first   = stories[0];
    const ownerId = shopId ?? first?.owner_id ?? '';
    StoriesStore.set(ownerId, stories);

    const logoSrc = this.#shopLogoSrc ?? '/shared/img/Logo01.png';

    const card = document.createElement('div');
    card.className      = 'card-mini story-card';
    card.dataset.shopId = ownerId;

    const wrap = document.createElement('div');
    wrap.className      = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted     = true;
    video.loop      = true;
    video.preload   = 'none';
    video.className = 'story-video';
    if (first?.media_url)      video.src    = first.media_url;
    if (first?.thumbnail_path) video.poster = first.thumbnail_path;

    const playBtn = document.createElement('div');
    playBtn.className   = 'story-play-btn';
    playBtn.textContent = '▶';

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src       = logoSrc;
    badge.alt       = '';
    badge.onerror   = function() { this.style.display = 'none'; };

    wrap.appendChild(video);
    wrap.appendChild(playBtn);
    wrap.appendChild(badge);

    const info = document.createElement('div');
    info.className = 'story-card-info';

    const nameP = document.createElement('p');
    nameP.className   = 'story-card-name';
    nameP.textContent = this.#shopName ?? '';

    const addrP = document.createElement('p');
    addrP.className = 'story-card-addr';

    info.appendChild(nameP);
    info.appendChild(addrP);

    const likeBtn = document.createElement('button');
    likeBtn.className        = 'story-like-btn';
    likeBtn.type             = 'button';
    likeBtn.dataset.action   = 'like';

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.className   = 'story-like-count';
    likeCount.textContent = String(first?.views_count ?? 0);

    likeBtn.appendChild(likeImg);
    likeBtn.appendChild(likeCount);

    card.appendChild(wrap);
    card.appendChild(info);
    card.appendChild(likeBtn);

    // Badge de contagem: somente se há mais de 1 story
    this.#atualizarContador(card, stories.length);

    // Sincroniza likes do viewer com o card via CustomEvent (sem acoplamento)
    card.addEventListener('story:like', (e) => {
      const { count } = e.detail ?? {};
      if (typeof count === 'number') likeCount.textContent = String(count);
    });

    return card;
  }

  /**
   * Adiciona ou atualiza o badge de contagem de stories no card.
   * Mostra somente se total > 1. Formato: "+3".
   * @param {HTMLElement} card
   * @param {number} total
   */
  #atualizarContador(card, total) {
    card.querySelector('.story-count-badge')?.remove();
    if (total <= 1) return;

    const countBadge = document.createElement('span');
    countBadge.className   = 'story-count-badge';
    countBadge.textContent = `+${total}`;
    card.appendChild(countBadge);
  }
}
