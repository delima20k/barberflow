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
    // 'home' sem barbershopId → feed (agrupa por barbershop_id via BFF)
    // 'scan' ativado apenas com context: 'scan' explícito (modo legado)
    if (this.#context === 'scan') return 'scan';
    return 'feed';
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
   * Chama endpoint dedicado que busca diretamente na tabela stories
   * e agrupa por barbearia — barbearias sem stories nunca aparecem.
   *
   * Performance: 1 request total (BFF agrega e resolve URLs).
   * Escalabilidade: max 8 barbearias, max 10 stories por barbearia.
   */
  async #carregarFeed() {
    const { data: feed, error } = await BffApiService.barbearias.feedStories();
    if (error || !Array.isArray(feed) || !feed.length) {
      this.#ocultarSecao();
      return;
    }

    this.#scrollEl.innerHTML = '';

    for (const { shop, stories } of feed) {
      if (!Array.isArray(stories) || !stories.length) continue;
      const logoUrl = typeof ApiService !== 'undefined'
        ? ApiService.getLogoUrl(shop.logo_path)
        : (shop.logo_path ?? '');
      const card = this.#criarCardGrupo(stories, shop.id, shop.name ?? '', logoUrl, shop.owner_id ?? null);
      this.#scrollEl.appendChild(card);
    }

    if (!this.#scrollEl.children.length) {
      this.#ocultarSecao();
      return;
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
   * Modo scan (DEPRECIADO — usar context: 'feed' na home).
   * Modo legado para cards estáticos HTML com data-shop-id.
   * Agrupa por shopId (não por owner_id) para garantir 1 card por barbearia.
   *
   * @deprecated Ativado apenas com context: 'scan' explícito.
   *             Homes devem usar context: 'feed' via iniciarHome().
   */
  async #carregarPorCards() {
    // Tenta data-shop-id primeiro (correto), fallback para data-owner-id (legado)
    const cards = [
      ...this.#scrollEl.querySelectorAll('.story-card[data-shop-id]'),
      ...this.#scrollEl.querySelectorAll('.story-card[data-owner-id]:not([data-shop-id])'),
    ];

    // Agrupa por shopId, mantendo apenas o PRIMEIRO card por barbearia
    const primeiroCardPorShop = new Map();
    for (const card of cards) {
      // Prefere data-shop-id (agrupamento por barbearia); fallback data-owner-id legado
      const sid = card.dataset.shopId ?? card.dataset.ownerId;
      if (!sid || sid.startsWith('00000000')) continue;
      if (!primeiroCardPorShop.has(sid)) {
        primeiroCardPorShop.set(sid, card);
      } else {
        card.hidden = true; // oculta card duplicado da mesma barbearia
      }
    }

    if (!primeiroCardPorShop.size) return;

    // Busca todos os stories em paralelo
    const buscas = [...primeiroCardPorShop.keys()].map(sid =>
      BffApiService.barbearias.listarStories(sid)
        .then(({ data }) => ({ sid, stories: Array.isArray(data) ? data : [] }))
        .catch(() => ({ sid, stories: [] })),
    );

    const resultados = await Promise.all(buscas);

    for (const { sid, stories } of resultados) {
      const card = primeiroCardPorShop.get(sid);
      if (!card) continue;

      if (!stories.length) {
        card.hidden = true;
        continue;
      }

      // Armazena todos os stories da barbearia no cache
      StoriesStore.set(sid, stories);

      // Popula thumbnail com o primeiro story (como <img>, sem autoplay)
      const primeiroStory = stories[0];
      const thumbEl = card.querySelector('.story-video');
      if (thumbEl) {
        // thumbnail_path é null na maioria dos stories de vídeo (upload não gera thumb);
        // fallback seguro: logo da barbearia (nunca avatar do barbeiro como preview principal)
        const thumbFallback = this.#shopLogoSrc ?? '/shared/img/Logo01.png';
        const thumbSrc = StoriesWidget.#resolverThumbUrl(
          primeiroStory.thumbnail_path,
          primeiroStory.media_url,
          primeiroStory.media_type,
        ) || thumbFallback;
        if (thumbEl.tagName === 'VIDEO') {
          // card HTML estático ainda usa <video> — aplica poster para evitar download
          thumbEl.setAttribute('poster', thumbSrc);
          thumbEl.removeAttribute('src');
          thumbEl.preload = 'none';
          const wrap = thumbEl.closest('.story-video-wrap');
          wrap?.classList.add('is-loaded');
        } else {
          thumbEl.src = thumbSrc;
        }
      }

      // Garante data-shop-id correto (agrupamento por barbearia)
      card.dataset.shopId = sid;

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
   * Marca thumbnails estaticas quando os cards entram na viewport.
   * Cards de stories nunca carregam o video completo.
   */  #bindObserver() {
    if (!this.#scrollEl?.querySelectorAll) return;

    const allCards = [...this.#scrollEl.querySelectorAll('.story-card:not([hidden])')];
    if (!allCards.length) return;

    const marcarThumbnail = (card) => {
      const media = card.querySelector('.story-video');
      const wrap = card.querySelector('.story-video-wrap');
      if (!media || !wrap) return;
      if (media.tagName !== 'IMG') {
        wrap.classList.add('is-loaded');
        return;
      }
      if (media.complete) {
        wrap.classList.add('is-loaded');
        return;
      }
      media.addEventListener('load', () => wrap.classList.add('is-loaded'), { once: true });
      media.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
    };

    if (typeof IntersectionObserver === 'undefined') {
      allCards.forEach(marcarThumbnail);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target;
        if (card.dataset.thumbObserved) continue;
        card.dataset.thumbObserved = '1';
        marcarThumbnail(card);
      }
    }, { root: this.#scrollEl, threshold: 0.1 });

    for (const card of allCards) observer.observe(card);
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
   * @param {object[]} stories      — array completo retornado pelo BFF
   * @param {string|null} shopId    — UUID da barbearia (fallback: stories[0].owner_id)
   * @param {string|null} shopName  — sobrescreve this.#shopName (modo feed)
   * @param {string|null} logoUrl   — sobrescreve this.#shopLogoSrc (modo feed)
   * @param {string|null} shopOwnerId — UUID do dono da barbearia (modo feed); detecta parceiro vs dono
   * @returns {HTMLDivElement}
   */
  #criarCardGrupo(stories, shopId = null, shopName = null, logoUrl = null, shopOwnerId = null) {
    const first   = stories[0];
    const ownerId = shopId ?? first?.owner_id ?? '';
    StoriesStore.set(ownerId, stories);

    // Determina se o primeiro story foi postado pelo dono ou por um parceiro
    const isParceiro = shopOwnerId && first?.owner_id && first.owner_id !== shopOwnerId;
    let displayName, displayLogo;
    if (isParceiro) {
      // Parceiro: exibe nome e avatar do barbeiro que postou
      displayName = first.poster_name ?? shopName ?? this.#shopName ?? '';
      const avatarPath = first.poster_avatar_path ?? null;
      displayLogo = avatarPath
        ? (typeof ApiService !== 'undefined' ? ApiService.getAvatarUrl(avatarPath) : avatarPath)
        : (logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png');
    } else {
      // Dono: exibe logo e nome da barbearia
      displayName = shopName ?? this.#shopName ?? '';
      displayLogo = logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png';
    }

    const card = document.createElement('div');
    card.className      = 'card-mini story-card';
    card.dataset.shopId = ownerId;

    const wrap = document.createElement('div');
    wrap.className      = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    // Thumbnail: prefere thumbnail_path (quando disponível), media_url para imagens,
    // fallback para logo da barbearia (thumbnail_path é null nos stories de vídeo pois
    // o upload não gera thumbnail — nunca usar avatar do barbeiro como preview principal)
    const thumbFallback = logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png';
    // thumbResolved: URL real (thumbnail_url do BFF ou thumbnail_path legacy). Null = nenhum thumb gerado.
    const thumbResolved = first?.thumbnail_url
      || StoriesWidget.#resolverThumbUrl(
          first?.thumbnail_path,
          first?.media_url,
          first?.media_type,
        )
      || null;
    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.src = thumbResolved || thumbFallback;
    thumb.onerror = function() { this.style.display = 'none'; };
    thumb.addEventListener('load', () => wrap.classList.add('is-loaded'), { once: true });
    thumb.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
    if (thumb.complete) wrap.classList.add('is-loaded');
    thumb.className = 'story-video';
    thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';

    const playBtn = document.createElement('div');
    playBtn.className   = 'story-play-btn';
    playBtn.textContent = '▶';

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src       = displayLogo;
    badge.alt       = '';
    badge.onerror   = function() { this.style.display = 'none'; };

    // Overlay do barbeiro que postou (topo-esquerdo, abaixo do badge)
    const barberAvatarSrcGrupo = first?.poster_avatar_path
      ? (typeof ApiService !== 'undefined' ? ApiService.getAvatarUrl(first.poster_avatar_path) : first.poster_avatar_path)
      : null;
    if (barberAvatarSrcGrupo || first?.poster_name) {
      const barberOverlay = document.createElement('div');
      barberOverlay.className = 'story-barber-overlay';
      if (barberAvatarSrcGrupo) {
        const barberAvatarImg = document.createElement('img');
        barberAvatarImg.className = 'story-barber-avatar';
        barberAvatarImg.src = barberAvatarSrcGrupo;
        barberAvatarImg.alt = '';
        barberAvatarImg.onerror = function() { this.style.display = 'none'; };
        barberOverlay.appendChild(barberAvatarImg);
      }
      const barberNameSpan = document.createElement('span');
      barberNameSpan.className = 'story-barber-name';
      barberNameSpan.textContent = first?.poster_name ?? displayName;
      barberOverlay.appendChild(barberNameSpan);
      wrap.appendChild(barberOverlay);
    }

    // Overlay da barbearia (canto inferior direito)
    const shopNameText = shopName ?? this.#shopName ?? '';
    const shopLogoSrcGrupo = logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png';
    if (shopNameText) {
      const shopOverlay = document.createElement('div');
      shopOverlay.className = 'story-shop-overlay';
      const shopLogoImg = document.createElement('img');
      shopLogoImg.className = 'story-shop-logo';
      shopLogoImg.src = shopLogoSrcGrupo;
      shopLogoImg.alt = '';
      shopLogoImg.onerror = function() { this.style.display = 'none'; };
      const shopNameSpan = document.createElement('span');
      shopNameSpan.className = 'story-shop-name';
      shopNameSpan.textContent = shopNameText;
      shopOverlay.appendChild(shopLogoImg);
      shopOverlay.appendChild(shopNameSpan);
      wrap.appendChild(shopOverlay);
    }

    wrap.appendChild(thumb);
    wrap.appendChild(playBtn);
    wrap.appendChild(badge);

    const info = document.createElement('div');
    info.className = 'story-card-info';

    const nameP = document.createElement('p');
    nameP.className   = 'story-card-name';
    nameP.textContent = displayName;

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
    const thumbSrc = story.thumbnail_url
      || StoriesWidget.#resolverThumbUrl(story.thumbnail_path, story.media_url, story.media_type);

    const card = document.createElement('div');
    card.className          = 'card-mini story-card';
    card.dataset.shopId     = shopId;
    card.dataset.storyIdx   = String(idx);

    const wrap = document.createElement('div');
    wrap.className      = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    const thumb = document.createElement('img');
    thumb.className = 'story-video';
    thumb.src = thumbSrc || logoSrc;
    thumb.alt = '';
    thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    thumb.onerror = function() { this.style.display = 'none'; };
    thumb.addEventListener('load', () => wrap.classList.add('is-loaded'), { once: true });
    thumb.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
    if (thumb.complete) wrap.classList.add('is-loaded');
    wrap.appendChild(thumb);
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

    // Overlay do barbeiro que postou este story individual (topo-esquerdo, abaixo do badge)
    const barberAvatarSrcInd = story.poster_avatar_path
      ? (typeof ApiService !== 'undefined' ? ApiService.getAvatarUrl(story.poster_avatar_path) : story.poster_avatar_path)
      : null;
    if (barberAvatarSrcInd || story.poster_name) {
      const barberOverlayInd = document.createElement('div');
      barberOverlayInd.className = 'story-barber-overlay';
      if (barberAvatarSrcInd) {
        const barberAvatarImgInd = document.createElement('img');
        barberAvatarImgInd.className = 'story-barber-avatar';
        barberAvatarImgInd.src = barberAvatarSrcInd;
        barberAvatarImgInd.alt = '';
        barberAvatarImgInd.onerror = function() { this.style.display = 'none'; };
        barberOverlayInd.appendChild(barberAvatarImgInd);
      }
      const barberNameSpanInd = document.createElement('span');
      barberNameSpanInd.className = 'story-barber-name';
      barberNameSpanInd.textContent = story.poster_name ?? this.#shopName ?? '';
      barberOverlayInd.appendChild(barberNameSpanInd);
      wrap.appendChild(barberOverlayInd);
    }

    // Overlay da barbearia (canto inferior direito)
    if (this.#shopName) {
      const shopOverlayInd = document.createElement('div');
      shopOverlayInd.className = 'story-shop-overlay';
      const shopLogoImgInd = document.createElement('img');
      shopLogoImgInd.className = 'story-shop-logo';
      shopLogoImgInd.src = logoSrc;
      shopLogoImgInd.alt = '';
      shopLogoImgInd.onerror = function() { this.style.display = 'none'; };
      const shopNameSpanInd = document.createElement('span');
      shopNameSpanInd.className = 'story-shop-name';
      shopNameSpanInd.textContent = this.#shopName;
      shopOverlayInd.appendChild(shopLogoImgInd);
      shopOverlayInd.appendChild(shopNameSpanInd);
      wrap.appendChild(shopOverlayInd);
    }

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
