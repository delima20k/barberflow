'use strict';

// =============================================================
// StoriesWidget.js — Carregamento dinâmico de stories por barbearia (OOP)
//
// Responsabilidades:
//   - Buscar stories via BFF (GET /api/v1/barbearias/:id/stories)
//   - Modo barbearia: rebuild completo do .stories-scroll com cards reais
//   - Modo scan: percorre cards existentes por data-owner-id e popula o src
//     do .story-video; ignora IDs de demonstração (prefixo 00000000)
//
// Dependências: BffApiService.js, ApiService.js
// =============================================================

class StoriesWidget {

  #scrollEl      = null;
  #barbershopId  = null;
  #shopName      = null;
  #shopLogoSrc   = null;

  /**
   * @param {HTMLElement} scrollEl         — container .stories-scroll
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
  // PRIVADOS
  // ══════════════════════════════════════════════════════════

  /** Modo rebuild: busca stories da barbearia e reconstrói os cards do zero. */
  async #carregarPorBarbearia() {
    const { data: stories, error } =
      await BffApiService.barbearias.listarStories(this.#barbershopId);

    if (error || !Array.isArray(stories) || !stories.length) {
      this.#ocultarSecao();
      return;
    }

    this.#scrollEl.innerHTML = '';
    for (const story of stories) {
      if (!story.media_url) continue;
      this.#scrollEl.appendChild(this.#criarCard(story));
    }

    if (!this.#scrollEl.children.length) {
      this.#ocultarSecao();
    } else {
      const section = this.#scrollEl.closest('.bp-stories-section');
      if (section) section.hidden = false;
    }
  }

  /**
   * Modo scan: percorre os .story-card existentes pelo data-owner-id.
   * Cards com IDs de demonstração (00000000-…) são ignorados (mantidos intactos).
   * Cards com IDs reais recebem o src do primeiro story encontrado.
   */
  async #carregarPorCards() {
    const cards  = [...this.#scrollEl.querySelectorAll('.story-card[data-owner-id]')];
    const reais  = new Map();

    for (const card of cards) {
      const oid = card.dataset.ownerId;
      if (!oid || oid.startsWith('00000000')) continue;
      if (!reais.has(oid)) reais.set(oid, []);
      reais.get(oid).push(card);
    }

    if (!reais.size) return;

    const buscas = [...reais.keys()].map(oid =>
      BffApiService.barbearias.listarStories(oid)
        .then(({ data }) => ({ oid, stories: Array.isArray(data) ? data : [] }))
        .catch(() => ({ oid, stories: [] })),
    );

    const resultados   = await Promise.all(buscas);
    const storiesPorId = new Map(resultados.map(r => [r.oid, r.stories]));

    for (const [oid, cardsDoOwner] of reais) {
      const stories = storiesPorId.get(oid) ?? [];
      for (let i = 0; i < cardsDoOwner.length; i++) {
        const story = stories[i];
        const card  = cardsDoOwner[i];
        if (!story?.media_url) { card.hidden = true; continue; }
        const video = card.querySelector('.story-video');
        if (video) video.src = story.media_url;
        card.dataset.storyId = story.id ?? '';
      }
    }
  }

  /** Oculta a section pai ou o próprio scroll se não houver section. */
  #ocultarSecao() {
    const section = this.#scrollEl.closest('.bp-stories-section');
    if (section) { section.hidden = true; return; }
    this.#scrollEl.hidden = true;
  }

  /**
   * Cria um card de story compatível com StoryViewer.
   * Estrutura espelha os cards estáticos do HTML — mantém compatibilidade total.
   * @param {object} story — objeto retornado pelo BFF
   * @returns {HTMLDivElement}
   */
  #criarCard(story) {
    const logoSrc = this.#shopLogoSrc ?? '/shared/img/Logo01.png';

    const card = document.createElement('div');
    card.className = 'card-mini story-card';
    card.dataset.storyId = story.id ?? '';
    card.dataset.ownerId = story.owner_id ?? '';

    const wrap = document.createElement('div');
    wrap.className = 'story-video-wrap';
    wrap.dataset.action = 'story-open';

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted   = true;
    video.loop    = true;
    video.preload = 'none';
    video.className = 'story-video';
    video.src = story.media_url;

    const playBtn = document.createElement('div');
    playBtn.className = 'story-play-btn';
    playBtn.textContent = '▶';

    const badge = document.createElement('img');
    badge.className = 'story-shop-badge';
    badge.src = logoSrc;
    badge.alt = '';
    badge.onerror = function() { this.style.display = 'none'; };

    wrap.appendChild(video);
    wrap.appendChild(playBtn);
    wrap.appendChild(badge);

    const info = document.createElement('div');
    info.className = 'story-card-info';

    const nameP = document.createElement('p');
    nameP.className = 'story-card-name';
    nameP.textContent = this.#shopName ?? '';

    const addrP = document.createElement('p');
    addrP.className = 'story-card-addr';

    info.appendChild(nameP);
    info.appendChild(addrP);

    const likeBtn = document.createElement('button');
    likeBtn.className = 'story-like-btn';
    likeBtn.type = 'button';
    likeBtn.dataset.action = 'like';

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.className = 'story-like-count';
    likeCount.textContent = String(story.views_count ?? 0);

    likeBtn.appendChild(likeImg);
    likeBtn.appendChild(likeCount);

    card.appendChild(wrap);
    card.appendChild(info);
    card.appendChild(likeBtn);

    return card;
  }
}
