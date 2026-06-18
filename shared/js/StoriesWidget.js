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

class StoryDeleteModal {
  static async confirmar() {
    if (typeof FluxoDeFila !== 'undefined') {
      const result = await FluxoDeFila.abrir({
        id: 'story-delete-confirm',
        titulo: 'Excluir video?',
        corpo: 'Este story sera removido da barbearia e da midia.',
        acoes: [
          { label: 'Excluir', valor: 'excluir', variante: 'perigo' },
          { label: 'Cancelar', valor: 'cancelar', variante: 'secundario' },
        ],
        fecharBtn: true,
        tocarSom: false,
      });
      return result === 'excluir';
    }
    return window.confirm('Excluir este video?');
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

    const displayName = shopName ?? first?.shop_name ?? this.#shopName ?? '';
    const displayLogo = logoUrl ?? this.#shopLogoSrc ?? '/shared/img/Logo01.png';

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
    // Thumbnail: exibe apenas quando há URL real — sem logo como cover.
    // Quando não há thumb o gradiente CSS do .story-video-wrap serve de fundo.
    if (thumbResolved) {
      const thumb = document.createElement('img');
      thumb.alt       = '';
      thumb.className = 'story-video';
      thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      thumb.onerror = function() { this.style.display = 'none'; };
      thumb.addEventListener('load',  () => wrap.classList.add('is-loaded'), { once: true });
      thumb.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
      if (thumb.complete) wrap.classList.add('is-loaded');
      thumb.src = thumbResolved;
      wrap.appendChild(thumb);
    } else {
      wrap.classList.add('is-loaded');
    }

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src       = displayLogo;
    badge.alt       = '';
    badge.onerror   = function() { this.style.display = 'none'; };

    // Overlay do barbeiro que postou (topo-esquerdo) — apenas fora do feed
    const barberAvatarSrcGrupo = first?.poster_avatar_path
      ? (typeof ApiService !== 'undefined' ? ApiService.getAvatarUrl(first.poster_avatar_path) : first.poster_avatar_path)
      : null;
    if (this.#context !== 'feed' && (barberAvatarSrcGrupo || first?.poster_name)) {
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

    wrap.appendChild(badge);

    const likeBtn = document.createElement('button');
    likeBtn.className        = 'story-like-btn';
    likeBtn.type             = 'button';
    likeBtn.dataset.action   = 'like';

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.className   = 'story-like-count';
    likeCount.textContent = String(first?.likes_count ?? 0);
    likeBtn.classList?.toggle?.('curtido', Boolean(first?.user_liked));

    likeBtn.appendChild(likeImg);
    likeBtn.appendChild(likeCount);

    card.appendChild(wrap);
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
      const { count, curtido } = e.detail ?? {};
      if (typeof count === 'number') likeCount.textContent = String(count);
      if (typeof curtido === 'boolean') likeBtn.classList?.toggle?.('curtido', curtido);
    });
    this.#bindLikeButton(likeBtn, first, card);

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
    const logoSrc  = this.#shopLogoSrc ?? (story.shop_logo_path && typeof ApiService !== 'undefined'
      ? ApiService.getLogoUrl(story.shop_logo_path)
      : null) ?? '/shared/img/Logo01.png';
    const isOwnerStory = story.tipo_autor !== 'parceiro';
    const authorAvatarSrc = story.poster_avatar_path
      ? (typeof ApiService !== 'undefined' ? ApiService.getAvatarUrl(story.poster_avatar_path) : story.poster_avatar_path)
      : null;
    const identityName = isOwnerStory
      ? (story.shop_name ?? this.#shopName ?? '')
      : (story.poster_name ?? story.shop_name ?? this.#shopName ?? '');
    const identityLogo = isOwnerStory ? logoSrc : (authorAvatarSrc ?? logoSrc);
    const thumbSrc = story.thumbnail_url
      || StoriesWidget.#resolverThumbUrl(story.thumbnail_path, story.media_url, story.media_type)
      || logoSrc;

    const card = document.createElement('div');
    card.className          = 'card-mini story-card';
    card.dataset.shopId     = shopId;
    card.dataset.storyIdx   = String(idx);
    card.dataset.mediaId    = story.media_id ?? '';

    const wrap = document.createElement('div');
    wrap.className      = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    // Thumbnail: exibe apenas quando há URL real — sem logo como cover.
    if (thumbSrc) {
      const thumb = document.createElement('img');
      thumb.className = 'story-video';
      thumb.alt       = '';
      thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      thumb.onerror = function() { this.style.display = 'none'; };
      thumb.addEventListener('load',  () => wrap.classList.add('is-loaded'), { once: true });
      thumb.addEventListener('error', () => wrap.classList.add('is-loaded'), { once: true });
      if (thumb.complete) wrap.classList.add('is-loaded');
      thumb.src = thumbSrc;
      wrap.appendChild(thumb);
    } else {
      wrap.classList.add('is-loaded');
    }

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src       = identityLogo;
    badge.alt       = '';
    badge.onerror   = function() { this.style.display = 'none'; };
    wrap.appendChild(badge);

    // Overlay do barbeiro que postou este story individual (apenas parceiros)
    const barberAvatarSrcInd = authorAvatarSrc;
    if (!isOwnerStory && (barberAvatarSrcInd || story.poster_name)) {
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
      barberNameSpanInd.textContent = identityName;
      barberOverlayInd.appendChild(barberNameSpanInd);
      wrap.appendChild(barberOverlayInd);
    }

    const likeBtn = document.createElement('button');
    likeBtn.className      = 'story-like-btn';
    likeBtn.type           = 'button';
    likeBtn.dataset.action = 'like';

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.className   = 'story-like-count';
    likeCount.textContent = String(story.likes_count ?? 0);
    likeBtn.classList?.toggle?.('curtido', Boolean(story.user_liked));

    likeBtn.appendChild(likeImg);
    likeBtn.appendChild(likeCount);

    card.appendChild(wrap);
    card.appendChild(likeBtn);

    // Click handler direto (card criado dinamicamente — StoriesLayout não o vê)
    card.setAttribute('data-sv-bound', '1');
    card.addEventListener('click', () => {
      if (typeof StoryViewer !== 'undefined') StoryViewer.abrir(card);
    });

    // Sincroniza likes do viewer com o card via CustomEvent
    card.addEventListener('story:like', (e) => {
      const { count, curtido } = e.detail ?? {};
      if (typeof count === 'number') likeCount.textContent = String(count);
      if (typeof curtido === 'boolean') likeBtn.classList?.toggle?.('curtido', curtido);
    });
    this.#bindLikeButton(likeBtn, story, card);

    this.#bindLongPressDelete(card, story, shopId);

    return card;
  }

  #bindLikeButton(likeBtn, story, card) {
    if (!likeBtn || !story?.media_id) return;
    likeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', null)) return;
      if (typeof BffApiService === 'undefined' || !BffApiService.media?.toggleStoryLike) return;
      if (likeBtn.disabled) return;

      const countEl = likeBtn.querySelector('.story-like-count');
      const previousLiked = Boolean(story.user_liked);
      const previousCount = Math.max(0, Number(story.likes_count ?? countEl?.textContent ?? 0));
      const optimisticLiked = !previousLiked;
      const optimisticCount = Math.max(0, previousCount + (optimisticLiked ? 1 : -1));

      story.user_liked = optimisticLiked;
      story.likes_count = optimisticCount;
      likeBtn.classList?.toggle?.('curtido', optimisticLiked);
      if (countEl) countEl.textContent = String(optimisticCount);
      likeBtn.disabled = true;

      const { data, error } = await BffApiService.media.toggleStoryLike(story.media_id);
      likeBtn.disabled = false;
      const finalLiked = error ? previousLiked : Boolean(data?.user_liked ?? optimisticLiked);
      const finalCount = error ? previousCount : Math.max(0, Number(data?.likes_count ?? optimisticCount));

      story.user_liked = finalLiked;
      story.likes_count = finalCount;
      likeBtn.classList?.toggle?.('curtido', finalLiked);
      if (countEl) countEl.textContent = String(finalCount);
      card.dispatchEvent(new CustomEvent('story:like', {
        bubbles: true,
        detail: { storyId: story.id, mediaId: story.media_id, curtido: finalLiked, count: finalCount },
      }));
    });
  }

  #bindLongPressDelete(card, story, shopId) {
    if (this.#context === 'feed' || this.#context === 'home') return;
    if (!story?.can_delete || !story?.media_id) return;

    let timer = null;
    let fired = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = (event) => {
      if (event.target?.closest?.('.story-like-btn')) return;
      fired = false;
      clear();
      timer = setTimeout(async () => {
        fired = true;
        const confirmed = await StoryDeleteModal.confirmar();
        if (!confirmed || typeof BffApiService === 'undefined') return;
        const { error } = await BffApiService.media.deletarStory(story.media_id);
        if (error) return;
        const stories = StoriesStore.get(shopId).filter(item => item.media_id !== story.media_id);
        StoriesStore.set(shopId, stories);
        card.remove();
      }, 500);
    };
    const stop = () => clear();

    card.addEventListener('pointerdown', start);
    card.addEventListener('pointerup', stop);
    card.addEventListener('pointerleave', stop);
    card.addEventListener('pointercancel', stop);
    card.addEventListener('click', (event) => {
      if (!fired) return;
      event.preventDefault();
      event.stopPropagation();
      fired = false;
    }, true);
  }
}
