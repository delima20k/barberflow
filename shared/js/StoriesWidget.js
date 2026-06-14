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
// StoriesWidget — carregamento dinâmico de stories por contexto
//
// Contextos:
//   'home'        — modo grupo: 1 card por barbearia (StoriesStore)
//   'public-shop' — modo individual: 1 card por story, abre viewer no índice
//   'my-shop'     — modo individual: 1 card por story, abre viewer no índice
//
// Dependências: StoriesStore, BffApiService.js, MediaViewer (fallback legacy)
// =============================================================

class StoriesWidget {

  #scrollEl     = null;
  #barbershopId = null;
  #shopName     = null;
  #shopLogoSrc  = null;
  #context      = 'home'; // 'home' | 'public-shop' | 'my-shop'

  /**
   * @param {HTMLElement} scrollEl
   * @param {object}      [opts]
   * @param {string|null} [opts.barbershopId]
   * @param {string|null} [opts.shopName]
   * @param {string|null} [opts.shopLogoSrc]
   * @param {string}      [opts.context]  'home' | 'public-shop' | 'my-shop'
   */
  constructor(scrollEl, { barbershopId = null, shopName = null, shopLogoSrc = null, context = 'home' } = {}) {
    this.#scrollEl     = scrollEl;
    this.#barbershopId = barbershopId;
    this.#shopName     = shopName;
    this.#shopLogoSrc  = shopLogoSrc;
    this.#context      = context;
  }

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /** Carrega e renderiza os stories. Fire-and-forget seguro. */
  async carregar() {
    if (!this.#scrollEl || typeof BffApiService === 'undefined') return;
    const modo = this.#resolverModo();
    if (modo === 'grupo') {
      await this.#carregarPorBarbearia();
    } else if (modo === 'individual') {
      await this.#carregarPorBarbeariIndividual();
    } else if (modo === 'feed') {
      await this.#carregarFeed();
    } else {
      await this.#carregarPorCards();
    }
    this.#bindObserver();
  }

  /**
   * Resolve o modo baseado no contexto e na presença de barbershopId.
   * @returns {'scan'|'grupo'|'individual'|'feed'}
   */
  #resolverModo() {
    if (this.#context === 'public-shop' || this.#context === 'my-shop') return 'individual';
    if (this.#context === 'feed') return 'feed';
    if (this.#barbershopId) return 'grupo';
    return 'scan';
  }

  /**
   * Convenience: cria e carrega um StoriesWidget para o scroll da home.
   * Modo feed: busca barbearias em destaque e carrega stories de cada uma.
   * @param {HTMLElement|null} telaInicio — elemento #tela-inicio
   */
  static iniciarHome(telaInicio) {
    const scroll = telaInicio?.querySelector?.('.stories-scroll');
    if (!scroll) return;
    new StoriesWidget(scroll, { context: 'feed' }).carregar().catch(() => {});
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS — carregamento
  // ══════════════════════════════════════════════════════════

  /**
   * Modo feed: 1 card por barbearia ativa com stories (home cliente + profissional).
   * Busca barbearias em destaque e carrega os stories de cada uma em paralelo.
   *
   * Performance: Promise.allSettled em paralelo (max 8 barbearias).
   * Isolamento: falha de 1 barbearia não impede as demais.
   * Escala: fácil aumentar o limite ou trocar por endpoint dedicado sem reescrita.
   */
  async #carregarFeed() {
    const { data: barbearias, error } = await BffApiService.barbearias.listarDestaque();
    if (error || !Array.isArray(barbearias) || !barbearias.length) {
      this.#ocultarSecao();
      return;
    }

    // Max 8: equilibra visibilidade com custo de requests
    const candidatas = barbearias.slice(0, 8);

    // Busca stories de todas em paralelo — evita N+1 sequencial
    const resultados = await Promise.allSettled(
      candidatas.map(shop =>
        BffApiService.barbearias.listarStories(shop.id)
          .then(({ data }) => ({
            shop,
            stories: Array.isArray(data) && data.length ? data : null,
          }))
          .catch(() => ({ shop, stories: null }))
      )
    );

    // Filtra somente barbearias com stories ativos
    const comStories = resultados
      .filter(r => r.status === 'fulfilled' && r.value.stories)
      .map(r => r.value);

    if (!comStories.length) {
      this.#ocultarSecao();
      return;
    }

    this.#scrollEl.innerHTML = '';

    for (const { shop, stories } of comStories) {
      const logoUrl = typeof ApiService !== 'undefined'
        ? ApiService.getLogoUrl(shop.logo_path)
        : (shop.logo_path ?? '');
      const card = this.#criarCardGrupo(stories, shop.id, shop.name ?? '', logoUrl);
      this.#scrollEl.appendChild(card);
    }

    // Recalibra carrossel com os novos cards dinâmicos (StoriesCarousel é idempotente)
    if (typeof StoriesCarousel !== 'undefined') {
      StoriesCarousel.aplicar(this.#scrollEl.parentElement ?? document);
    }
  }

  /** Modo grupo: cria UM card para a barbearia com todos os stories (Home). */
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
   * Modo individual: N cards (1 por story) para barbearia pública / minha barbearia.
   * Card usa thumbnail <img> estática, sem autoplay.
   * Clicar abre StoryViewer posicionado no índice daquele story.
   */
  async #carregarPorBarbeariIndividual() {
    const { data: stories, error } =
      await BffApiService.barbearias.listarStories(this.#barbershopId);

    if (error || !Array.isArray(stories) || !stories.length) {
      this.#ocultarSecao();
      return;
    }

    StoriesStore.set(this.#barbershopId, stories);

    this.#scrollEl.innerHTML = '';
    stories.forEach((story, idx) => {
      const card = this.#criarCardIndividual(story, idx, this.#barbershopId);
      this.#scrollEl.appendChild(card);
    });

    if (!this.#scrollEl.children.length) {
      this.#ocultarSecao();
      return;
    }

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
        const posterUrl = StoriesWidget.#resolverThumbUrl(primeiroStory.thumbnail_path, null, null);
        if (posterUrl) video.poster = posterUrl;
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
        if (!video) continue;

        if (video.tagName === 'IMG') {
          // Thumbnail estática: marcar is-loaded via load/error
          if (video.complete) { wrap?.classList.add('is-loaded'); }
          else {
            video.addEventListener('load',  () => wrap?.classList.add('is-loaded'), { once: true });
            video.addEventListener('error', () => wrap?.classList.add('is-loaded'), { once: true });
          }
        } else if (!video.src) {
          // Vídeo demo sem src: parar shimmer e mostrar poster
          wrap?.classList.add('is-loaded');
        } else {
          video.preload = 'metadata';
          video.onloadedmetadata = () => wrap?.classList.add('is-loaded');
          video.onerror = () => this.#aoErrarVideo(card, video);
          if (typeof video.load === 'function') video.load();
        }
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

          if (video.tagName === 'IMG') {
            // Thumbnail estática: marcar is-loaded via load/error
            if (video.complete) { wrap?.classList.add('is-loaded'); }
            else {
              video.addEventListener('load',  () => wrap?.classList.add('is-loaded'), { once: true });
              video.addEventListener('error', () => wrap?.classList.add('is-loaded'), { once: true });
            }
          } else if (!video.src) {
            // Vídeo demo sem src: parar shimmer e mostrar poster, sem load()
            wrap?.classList.add('is-loaded');
          } else {
            // Vídeo real: lazy loading normal
            video.preload = 'metadata';
            video.onloadedmetadata = () => wrap?.classList.add('is-loaded');
            video.onerror = () => this.#aoErrarVideo(card, video);
            if (typeof video.load === 'function') video.load();
          }
        } else if (!entry.isIntersecting) {
          if (video.tagName !== 'IMG' && video.src && !video.paused) video.pause();
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
   * @param {string|null} shopName — sobrescreve this.#shopName (modo feed)
   * @param {string|null} logoUrl — sobrescreve this.#shopLogoSrc (modo feed)
   * @returns {HTMLDivElement}
   */
  #criarCardGrupo(stories, shopId = null, shopName = null, logoUrl = null) {
    const first   = stories[0];
    const ownerId = shopId ?? first?.owner_id ?? '';
    StoriesStore.set(ownerId, stories);

    const logoSrc = logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png';

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
    if (first?.media_url) video.src = first.media_url;
    const posterUrl = StoriesWidget.#resolverThumbUrl(first?.thumbnail_path, null, null);
    if (posterUrl) video.poster = posterUrl;

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
    nameP.textContent = shopName ?? this.#shopName ?? '';

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

    // Click handler direto (card criado dinamicamente — StoriesLayout não o vê)
    card.setAttribute('data-sv-bound', '1');
    card.addEventListener('click', () => {
      if (typeof StoryViewer !== 'undefined') StoryViewer.abrir(card);
    });

    // Sincroniza likes do viewer com o card via CustomEvent (sem acoplamento)
    card.addEventListener('story:like', (e) => {
      const { count } = e.detail ?? {};
      if (typeof count === 'number') likeCount.textContent = String(count);
    });

    return card;
  }

  /**
   * Converte storage path de thumbnail para URL pública acessível.
   * Usa SupabaseService > ApiService > caminho bruto como fallback.
   * Para media_url de vídeo como fallback: ignora (retorna vazio).
   *
   * @param {string|null} thumbnailPath — storage path da thumbnail
   * @param {string|null} mediaUrl      — URL já resolvida do vídeo/imagem
   * @param {string|null} mediaType     — 'video' | 'image' | null
   * @returns {string}
   */
  static #resolverThumbUrl(thumbnailPath, mediaUrl, mediaType) {
    if (thumbnailPath) {
      if (typeof SupabaseService !== 'undefined') return SupabaseService.getLogoUrl(thumbnailPath);
      if (typeof ApiService      !== 'undefined') return ApiService.getLogoUrl(thumbnailPath);
      return thumbnailPath;
    }
    // Fallback: usa media_url somente se for imagem (não vídeo)
    if (mediaType !== 'video' && mediaUrl) return mediaUrl;
    return '';
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

  /**
   * Cria 1 card individual representando um único story.
   * Usa thumbnail <img> estática (sem autoplay).
   * Ao clicar abre StoryViewer posicionado no índice correto dentro dos stories da barbearia.
   *
   * @param {object} story  — objeto do BFF
   * @param {number} idx    — índice dentro do array (para o viewer iniciar no story certo)
   * @param {string} shopId — UUID da barbearia (já populado no StoriesStore)
   * @returns {HTMLDivElement}
   */
  #criarCardIndividual(story, idx, shopId) {
    const logoSrc  = this.#shopLogoSrc ?? '/shared/img/Logo01.png';
    // Converte thumbnail_path para URL pública; para vídeo sem thumb, não usa media_url
    const thumbSrc = StoriesWidget.#resolverThumbUrl(story.thumbnail_path, story.media_url, story.media_type);

    const card = document.createElement('div');
    card.className          = 'card-mini story-card';
    card.dataset.shopId     = shopId;
    card.dataset.storyIdx   = String(idx);

    const wrap = document.createElement('div');
    wrap.className      = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    // Thumbnail estática — não carrega o vídeo no card
    if (thumbSrc) {
      const thumb = document.createElement('img');
      thumb.className = 'story-video'; // mantém classe para CSS compartilhado
      thumb.src       = thumbSrc;
      thumb.alt       = '';
      thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      thumb.onerror = function() { this.style.display = 'none'; };
      // Marca is-loaded quando a imagem carrega (card dinâmico — StoriesLayout não o vê)
      thumb.addEventListener('load',  () => wrap.classList.add('is-loaded'), { once: true });
      thumb.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
      if (thumb.complete) wrap.classList.add('is-loaded');
      wrap.appendChild(thumb);
    } else {
      // Sem thumbnail: mostra shimmer removido imediatamente
      wrap.classList.add('is-loaded');
    }

    const playBtn = document.createElement('div');
    playBtn.className   = 'story-play-btn';
    playBtn.textContent = '▶';
    wrap.appendChild(playBtn);

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src       = logoSrc;
    badge.alt       = '';
    badge.onerror   = function() { this.style.display = 'none'; };
    wrap.appendChild(badge);

    const info = document.createElement('div');
    info.className = 'story-card-info';

    const nameP = document.createElement('p');
    nameP.className   = 'story-card-name';
    nameP.textContent = this.#shopName ?? '';

    const addrP = document.createElement('p');
    addrP.className   = 'story-card-addr';
    addrP.textContent = story.created_at
      ? new Date(story.created_at).toLocaleDateString('pt-BR')
      : '';

    info.appendChild(nameP);
    info.appendChild(addrP);

    const likeBtn = document.createElement('button');
    likeBtn.className      = 'story-like-btn';
    likeBtn.type           = 'button';
    likeBtn.dataset.action = 'like';

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.className   = 'story-like-count';
    likeCount.textContent = String(story.views_count ?? 0);

    likeBtn.appendChild(likeImg);
    likeBtn.appendChild(likeCount);

    card.appendChild(wrap);
    card.appendChild(info);
    card.appendChild(likeBtn);

    // Click handler direto (card criado dinamicamente — StoriesLayout não o vê)
    card.setAttribute('data-sv-bound', '1');
    card.addEventListener('click', () => {
      if (typeof StoryViewer !== 'undefined') StoryViewer.abrir(card);
    });

    // Sincroniza likes do viewer com o card via CustomEvent
    card.addEventListener('story:like', (e) => {
      const { count } = e.detail ?? {};
      if (typeof count === 'number') likeCount.textContent = String(count);
    });

    return card;
  }
}
