'use strict';

// =============================================================
// StoryViewer.js — Visualizador expandido de Stories (POO)
//
// Responsabilidades (separadas por método privado):
//   #criarDOM()           — constrói toda a estrutura DOM via createElement
//   #cacheEls()           — armazena referências em #els (zero getElementById)
//   #bindEventos()        — vincula eventos via addEventListener (zero onclick inline)
//   #bindSwipe()          — swipe touch com #swipeStartX como campo privado
//   #bindTeclado()        — atalhos de teclado (←→ Esc)
//   #lerCard()            — lê dados do card atual e retorna objeto limpo
//   #renderizar()         — aplica dados à UI
//   #atualizarNavegacao() — controla visibilidade de prev/next
//   #flip()               — animação virar carta (rotateY 0→90→0)
//   #aguardar(ms)         — Promise utilitária sem setTimeout espalhado
//   #abrirOverlay()       — exibe overlay com transição CSS
//   #fecharOverlay()      — oculta overlay com transição CSS
//
// Uso:
//   StoryViewer.abrir(wrap)  — wrap = .story-video-wrap clicado
//   StoryViewer.fechar()
//   StoryViewer.prev()
//   StoryViewer.next()
//   StoryViewer.toggleLike()
// =============================================================

class StoryViewer {

  // ── Estado ─────────────────────────────────────────────────
  static #cards       = [];    // todos os .story-card do container ativo
  static #idx         = 0;     // índice do card exibido
  static #flipping    = false; // trava para evitar flip duplo
  static #swipeStartX = 0;     // campo privado para início do toque

  // ── Referências DOM cacheadas (únicas chamadas a getElementById) ──
  static #els = {
    overlay:   null,
    backdrop:  null,
    inner:     null,
    innerWrap: null,
    video:     null,
    badge:     null,
    nome:      null,
    addr:      null,
    likeBtn:   null,
    likeCount: null,
    likeImg:   null,
    btnFechar: null,
    prev:      null,
    next:      null,
  };

  // ── Constantes ─────────────────────────────────────────────
  static #FLIP_DUR  = 200;                           // ms por fase do flip
  static #EASE      = 'cubic-bezier(0.4,0,0.2,1)';  // curva de animação
  static #SWIPE_MIN = 44;                            // px mínimos p/ swipe

  // ═══════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre o viewer posicionado no card clicado.
   * @param {HTMLElement} wrap — .story-video-wrap
   */
  static abrir(wrap) {
    const cardEl    = wrap.closest('.story-card');
    const container = wrap.closest('.stories-scroll');
    if (!cardEl || !container) return;

    this.#cards = [...container.querySelectorAll('.story-card')];
    this.#idx   = this.#cards.indexOf(cardEl);

    this.#garantirDOM();
    this.#renderizar();
    this.#abrirOverlay();
  }

  /** Fecha o viewer e pausa o vídeo atual. */
  static fechar() {
    if (!this.#els.overlay) return;
    this.#els.video?.pause();
    this.#flipping = false;
    this.#fecharOverlay();
  }

  /** Vai para o story anterior com animação de flip. */
  static async prev() {
    if (this.#flipping || this.#idx <= 0) return;
    this.#idx--;
    await this.#flip();
  }

  /** Vai para o próximo story com animação de flip. */
  static async next() {
    if (this.#flipping || this.#idx >= this.#cards.length - 1) return;
    this.#idx++;
    await this.#flip();
  }

  /**
   * Alterna curtida no viewer e sincroniza com o card da lista.
   * Mantém o estado dos dois em sincronia bidirecional.
   */
  static toggleLike() {
    const { likeBtn, likeCount } = this.#els;
    const card = this.#cards[this.#idx];
    if (!likeBtn || !card) return;

    const curtido      = likeBtn.classList.toggle('curtido');
    const cardLikeBtn  = card.querySelector('.story-like-btn');
    const cardLikeSpan = card.querySelector('.story-like-count');

    cardLikeBtn?.classList.toggle('curtido', curtido);

    const novoVal = (parseInt(likeCount.textContent) || 0) + (curtido ? 1 : -1);
    likeCount.textContent = novoVal;
    if (cardLikeSpan) cardLikeSpan.textContent = novoVal;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Bootstrap do DOM
  // ═══════════════════════════════════════════════════════════

  /** Garante que o overlay existe — cria apenas uma vez. */
  static #garantirDOM() {
    if (document.getElementById('sv-overlay')) {
      this.#cacheEls();
      return;
    }
    this.#criarDOM();
    this.#cacheEls();
    this.#bindEventos();
  }

  /**
   * Constrói toda a estrutura do viewer via createElement.
   * ZERO innerHTML com onclick inline — responsabilidade única.
   */
  static #criarDOM() {
    // ── Overlay raiz ──────────────────────────────────────────
    const overlay  = document.createElement('div');
    overlay.id     = 'sv-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'sv-backdrop';

    // ── Card central ──────────────────────────────────────────
    const svCard   = document.createElement('div');
    svCard.className = 'sv-card';

    // Botão prev
    const btnPrev  = document.createElement('button');
    btnPrev.id     = 'sv-prev';
    btnPrev.className = 'sv-nav sv-nav-prev';
    btnPrev.setAttribute('aria-label', 'Story anterior');
    btnPrev.textContent = '‹';

    // Botão next
    const btnNext  = document.createElement('button');
    btnNext.id     = 'sv-next';
    btnNext.className = 'sv-nav sv-nav-next';
    btnNext.setAttribute('aria-label', 'Próximo story');
    btnNext.textContent = '›';

    // Wrapper com perspective
    const innerWrap   = document.createElement('div');
    innerWrap.className = 'sv-inner-wrap';

    // Inner — elemento que rotaciona
    const inner    = document.createElement('div');
    inner.id       = 'sv-inner';
    inner.className = 'sv-inner';

    // Vídeo
    const video    = document.createElement('video');
    video.id       = 'sv-video';
    video.className = 'sv-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');

    // ── Topo: badge + info + fechar ───────────────────────────
    const svTop    = document.createElement('div');
    svTop.className = 'sv-top';

    const badge    = document.createElement('img');
    badge.id       = 'sv-badge';
    badge.className = 'sv-badge';
    badge.alt      = '';

    const svInfo   = document.createElement('div');
    svInfo.className = 'sv-info';

    const nome     = document.createElement('p');
    nome.id        = 'sv-nome';
    nome.className = 'sv-nome';

    const addr     = document.createElement('p');
    addr.id        = 'sv-addr';
    addr.className = 'sv-addr';

    const btnFechar = document.createElement('button');
    btnFechar.className = 'sv-fechar';
    btnFechar.setAttribute('aria-label', 'Fechar');
    btnFechar.textContent = '✕';

    svInfo.append(nome, addr);
    svTop.append(badge, svInfo, btnFechar);

    // ── Base: curtir ──────────────────────────────────────────
    const svBottom = document.createElement('div');
    svBottom.className = 'sv-bottom';

    const likeBtn  = document.createElement('button');
    likeBtn.id     = 'sv-like-btn';
    likeBtn.className = 'sv-like-btn';
    likeBtn.setAttribute('aria-label', 'Curtir story');

    const likeImg  = document.createElement('img');
    likeImg.src    = '/shared/img/icones_curtir.png';
    likeImg.alt    = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.id    = 'sv-like-count';
    likeCount.textContent = '0';

    likeBtn.append(likeImg, likeCount);
    svBottom.appendChild(likeBtn);

    // ── Montar hierarquia ─────────────────────────────────────
    inner.append(video, svTop, svBottom);
    innerWrap.appendChild(inner);
    svCard.append(btnPrev, innerWrap, btnNext);
    overlay.append(backdrop, svCard);
    document.body.appendChild(overlay);
  }

  /** Popula #els com todas as referências DOM — chamado após #criarDOM(). */
  static #cacheEls() {
    this.#els = {
      overlay:   document.getElementById('sv-overlay'),
      backdrop:  document.querySelector('.sv-backdrop'),
      inner:     document.getElementById('sv-inner'),
      innerWrap: document.querySelector('.sv-inner-wrap'),
      video:     document.getElementById('sv-video'),
      badge:     document.getElementById('sv-badge'),
      nome:      document.getElementById('sv-nome'),
      addr:      document.getElementById('sv-addr'),
      likeBtn:   document.getElementById('sv-like-btn'),
      likeCount: document.getElementById('sv-like-count'),
      likeImg:   document.querySelector('#sv-like-btn img'),
      btnFechar: document.querySelector('.sv-fechar'),
      prev:      document.getElementById('sv-prev'),
      next:      document.getElementById('sv-next'),
    };
  }

  /**
   * Vincula todos os eventos via addEventListener.
   * ZERO onclick inline — responsabilidade única.
   */
  static #bindEventos() {
    this.#els.backdrop.addEventListener('click',  () => StoryViewer.fechar());
    this.#els.btnFechar.addEventListener('click', () => StoryViewer.fechar());
    this.#els.prev.addEventListener('click',      () => StoryViewer.prev());
    this.#els.next.addEventListener('click',      () => StoryViewer.next());
    this.#els.likeBtn.addEventListener('click',   () => StoryViewer.toggleLike());
    this.#bindSwipe();
    this.#bindTeclado();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Renderização
  // ═══════════════════════════════════════════════════════════

  /**
   * Lê os dados do card atual e retorna um objeto de valor limpo.
   * Único ponto de leitura do DOM dos cards — sem acoplamento direto.
   * @returns {{ videoSrc, poster, badgeSrc, nome, addr, likeCount, curtido, card }}
   */
  static #lerCard() {
    const card = this.#cards[this.#idx];
    const vid  = card.querySelector('.story-video');
    return {
      videoSrc:  vid?.src                        || '',
      poster:    vid?.getAttribute('poster')     || '',
      badgeSrc:  card.querySelector('.story-shop-badge')?.src        || '',
      nome:      card.querySelector('.story-card-name')?.textContent || '',
      addr:      card.querySelector('.story-card-addr')?.textContent || '',
      likeCount: card.querySelector('.story-like-count')?.textContent || '0',
      curtido:   card.querySelector('.story-like-btn')?.classList.contains('curtido') ?? false,
      card,
    };
  }

  /** Aplica os dados do card atual à UI do viewer. */
  static #renderizar() {
    const d = this.#lerCard();
    const { video, badge, nome, addr, likeBtn, likeCount } = this.#els;

    video.pause();
    video.poster = d.poster;
    video.src    = d.videoSrc;
    video.play().catch(() => {});

    badge.src             = d.badgeSrc;
    nome.textContent      = d.nome;
    addr.textContent      = d.addr;
    likeCount.textContent = d.likeCount;
    likeBtn.classList.toggle('curtido', d.curtido);

    this.#atualizarNavegacao();
  }

  /** Atualiza visibilidade dos botões de navegação. */
  static #atualizarNavegacao() {
    this.#els.prev.style.visibility = this.#idx > 0                      ? '' : 'hidden';
    this.#els.next.style.visibility = this.#idx < this.#cards.length - 1 ? '' : 'hidden';
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Overlay
  // ═══════════════════════════════════════════════════════════

  static #abrirOverlay() {
    const { overlay } = this.#els;
    overlay.style.display = 'flex';
    void overlay.offsetWidth;              // força reflow para CSS transition
    overlay.classList.add('sv-ativo');
    document.body.style.overflow = 'hidden';
  }

  static #fecharOverlay() {
    const { overlay } = this.#els;
    overlay.classList.remove('sv-ativo');
    setTimeout(() => {
      overlay.style.display    = '';
      document.body.style.overflow = '';
    }, 300);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Animação flip
  // ═══════════════════════════════════════════════════════════

  /**
   * Animação virar carta em duas fases simétricas:
   *   Fase 1: rotateY(0°) → rotateY(90°)   carta some
   *   [conteúdo trocado com carta de lado]
   *   Fase 2: rotateY(90°) → rotateY(0°)   novo card aparece
   */
  static async #flip() {
    this.#flipping = true;
    const { inner, video } = this.#els;
    const transition = `transform ${this.#FLIP_DUR}ms ${this.#EASE}`;

    inner.style.transition = transition;
    inner.style.transform  = 'rotateY(90deg)';
    await this.#aguardar(this.#FLIP_DUR);

    video.pause();
    this.#renderizar();

    inner.style.transform = 'rotateY(0deg)';
    await this.#aguardar(this.#FLIP_DUR);

    inner.style.transition = '';
    inner.style.transform  = '';
    this.#flipping = false;
  }

  /** Promessa utilitária — evita new Promise(setTimeout) espalhado. */
  static #aguardar(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Swipe e Teclado
  // ═══════════════════════════════════════════════════════════

  /**
   * Swipe horizontal no wrapper para navegação em mobile.
   * #swipeStartX é campo privado — não vaza para closure.
   */
  static #bindSwipe() {
    const { innerWrap } = this.#els;

    innerWrap.addEventListener('touchstart', e => {
      this.#swipeStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    innerWrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - this.#swipeStartX;
      if (Math.abs(dx) < this.#SWIPE_MIN) return;
      dx < 0 ? StoryViewer.next() : StoryViewer.prev();
    }, { passive: true });
  }

  /** Atalhos de teclado — ativa só quando o overlay está aberto. */
  static #bindTeclado() {
    document.addEventListener('keydown', e => {
      if (!this.#els.overlay?.classList.contains('sv-ativo')) return;
      if (e.key === 'ArrowLeft')  StoryViewer.prev();
      if (e.key === 'ArrowRight') StoryViewer.next();
      if (e.key === 'Escape')     StoryViewer.fechar();
    });
  }
}
