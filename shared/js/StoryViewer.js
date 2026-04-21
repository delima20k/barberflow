'use strict';

// =============================================================
// StorySwipeTransition — Animação pseudo-3D entre stories (POO)
// =============================================================

class StorySwipeTransition {

  static #DUR_COMPLETAR = 300;
  static #DUR_CANCELAR  = 380;
  static #EASE_SLIDE    = 'cubic-bezier(0.22,0.61,0.36,1)';
  static #EASE_SPRING   = 'cubic-bezier(0.34,1.56,0.64,1)';
  static #ROT_MAX       = 14;
  static #SCALE_MIN     = 0.88;
  static #OPACITY_MIN   = 0.28;
  static #DARKEN_MAX    = 0.44;

  static aplicarSwipe(ativo, prox, dx, ww, dir) {
    const p       = Math.min(Math.abs(dx) / ww, 1);
    const sinal   = dx < 0 ? -1 : 1;
    const rot     = p * StorySwipeTransition.#ROT_MAX * sinal;
    const scale   = 1 - p * (1 - StorySwipeTransition.#SCALE_MIN);
    const opacity = 1 - p * (1 - StorySwipeTransition.#OPACITY_MIN);
    const darken  = p * StorySwipeTransition.#DARKEN_MAX;

    ativo.style.transition = '';
    ativo.style.transform  = `translateX(${dx}px) rotateY(${rot}deg) scale(${scale})`;
    ativo.style.opacity    = opacity;
    ativo.style.setProperty('--sv-darken', darken);

    const proxX      = dir * ww + dx;
    const proxScale  = StorySwipeTransition.#SCALE_MIN + p * (1 - StorySwipeTransition.#SCALE_MIN);
    const proxOp     = StorySwipeTransition.#OPACITY_MIN + p * (1 - StorySwipeTransition.#OPACITY_MIN);
    const proxRot    = -rot * 0.5;
    const proxDarken = (1 - p) * StorySwipeTransition.#DARKEN_MAX * 0.35;

    prox.style.transition = '';
    prox.style.transform  = `translateX(${proxX}px) rotateY(${proxRot}deg) scale(${proxScale})`;
    prox.style.opacity    = proxOp;
    prox.style.setProperty('--sv-darken', proxDarken);
  }

  static completar(ativo, prox, dir, ww) {
    const dur = StorySwipeTransition.#DUR_COMPLETAR;
    const e   = StorySwipeTransition.#EASE_SLIDE;
    const tr  = `transform ${dur}ms ${e}, opacity ${dur}ms ${e}`;

    ativo.style.transition = tr;
    ativo.style.transform  = `translateX(${-dir * ww}px) rotateY(${-dir * StorySwipeTransition.#ROT_MAX}deg) scale(${StorySwipeTransition.#SCALE_MIN})`;
    ativo.style.opacity    = StorySwipeTransition.#OPACITY_MIN;
    ativo.style.setProperty('--sv-darken', StorySwipeTransition.#DARKEN_MAX);

    prox.style.transition = tr;
    prox.style.transform  = 'translateX(0) rotateY(0deg) scale(1)';
    prox.style.opacity    = '1';
    prox.style.setProperty('--sv-darken', 0);

    return new Promise(r => setTimeout(r, dur));
  }

  static cancelar(ativo, prox, dir, ww) {
    const dur = StorySwipeTransition.#DUR_CANCELAR;
    const e   = StorySwipeTransition.#EASE_SPRING;
    const tr  = `transform ${dur}ms ${e}, opacity ${dur}ms ${e}`;

    ativo.style.transition = tr;
    ativo.style.transform  = 'translateX(0) rotateY(0deg) scale(1)';
    ativo.style.opacity    = '1';
    ativo.style.setProperty('--sv-darken', 0);

    prox.style.transition = tr;
    prox.style.transform  = `translateX(${dir * ww}px) rotateY(0deg) scale(${StorySwipeTransition.#SCALE_MIN})`;
    prox.style.opacity    = StorySwipeTransition.#OPACITY_MIN;
    prox.style.setProperty('--sv-darken', 0);

    return new Promise(r => setTimeout(r, dur));
  }

  static limpar(el) {
    el.style.transition = '';
    el.style.transform  = '';
    el.style.opacity    = '';
    el.style.zIndex     = '';
    el.style.removeProperty('--sv-darken');
  }
}

// =============================================================
// StoryProgressLayer — Indicadores de posição (pílulas) (POO)
// =============================================================

class StoryProgressLayer {

  static #MARCA = 'data-sp-total';

  static render(stage, total, idx) {
    let bar = stage.querySelector('.sv-progress');
    if (!bar || parseInt(bar.getAttribute(StoryProgressLayer.#MARCA)) !== total) {
      bar = StoryProgressLayer.#criarDOM(stage, total);
    }
    bar.querySelectorAll('.sv-progress-pill').forEach((pill, i) => {
      pill.classList.toggle('ativo', i === idx);
    });
  }

  static #criarDOM(stage, total) {
    stage.querySelector('.sv-progress')?.remove();
    const bar = document.createElement('div');
    bar.className = 'sv-progress';
    bar.setAttribute(StoryProgressLayer.#MARCA, total);
    for (let i = 0; i < total; i++) {
      const pill = document.createElement('div');
      pill.className = 'sv-progress-pill';
      bar.appendChild(pill);
    }
    stage.appendChild(bar);
    return bar;
  }
}

// =============================================================
// StoryViewer — Visualizador expandido de Stories (POO)
//
// Uso:
//   StoryViewer.abrir(wrap)  — wrap = .story-video-wrap clicado
//   StoryViewer.fechar()
//   StoryViewer.prev()
//   StoryViewer.next()
//   StoryViewer.toggleLike()
// =============================================================

class StoryViewer {

  static #cards      = [];
  static #idx        = 0;
  static #flipping   = false;

  // story metadata do card ativo
  static #storyId  = null;
  static #ownerId  = null;

  static #swipeStartX = 0;
  static #swipeDx     = 0;
  static #swipeAtivo  = false;
  static #swipeDir    = 0;

  static #ativo = null;
  static #prox  = null;

  static #els = {
    overlay:   null,
    backdrop:  null,
    svCard:    null,
    stage:     null,
    innerA:    null,
    innerB:    null,
    prev:      null,
    next:      null,
    video:     null,
    badge:     null,
    nome:      null,
    addr:      null,
    likeBtn:   null,
    likeCount: null,
    likeImg:   null,
    btnFechar: null,
  };

  static #SWIPE_MIN = 44;

  // ── API PÚBLICA ────────────────────────────────────────────

  static abrir(wrap) {
    const cardEl    = wrap.closest('.story-card');
    const container = wrap.closest('.stories-scroll');
    if (!cardEl || !container) return;

    StoryViewer.#cards = [...container.querySelectorAll('.story-card')];
    StoryViewer.#idx   = StoryViewer.#cards.indexOf(cardEl);

    StoryViewer.#garantirDOM();

    StoryViewer.#ativo = StoryViewer.#els.innerA;
    StoryViewer.#prox  = StoryViewer.#els.innerB;

    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StorySwipeTransition.limpar(StoryViewer.#prox);
    StoryViewer.#prox.style.display = 'none';

    StoryViewer.#renderizar();
    StoryProgressLayer.render(StoryViewer.#els.stage, StoryViewer.#cards.length, StoryViewer.#idx);
    StoryViewer.#abrirOverlay();
  }

  static fechar() {
    if (!StoryViewer.#els.overlay) return;
    StoryViewer.#els.video?.pause();
    StoryViewer.#flipping   = false;
    StoryViewer.#swipeAtivo = false;
    StoryViewer.#fecharOverlay();
  }

  static async prev() {
    if (StoryViewer.#flipping || StoryViewer.#idx <= 0) return;
    StoryViewer.#flipping = true;
    StoryViewer.#idx--;
    await StoryViewer.#transicao3D(-1);
    StoryViewer.#flipping = false;
  }

  static async next() {
    if (StoryViewer.#flipping || StoryViewer.#idx >= StoryViewer.#cards.length - 1) return;
    StoryViewer.#flipping = true;
    StoryViewer.#idx++;
    await StoryViewer.#transicao3D(+1);
    StoryViewer.#flipping = false;
  }

  static toggleLike() {
    const { likeBtn, likeCount } = StoryViewer.#els;
    const card = StoryViewer.#cards[StoryViewer.#idx];
    if (!likeBtn || !card) return;

    const curtido      = likeBtn.classList.toggle('curtido');
    const cardLikeBtn  = card.querySelector('.story-like-btn');
    const cardLikeSpan = card.querySelector('.story-like-count');

    cardLikeBtn?.classList.toggle('curtido', curtido);

    const novoVal = (parseInt(likeCount.textContent) || 0) + (curtido ? 1 : -1);
    likeCount.textContent = novoVal;
    if (cardLikeSpan) cardLikeSpan.textContent = novoVal;
  }

  // ── PRIVADO — DOM ──────────────────────────────────────────

  static #garantirDOM() {
    if (document.getElementById('sv-overlay')) {
      StoryViewer.#cacheEls();
      return;
    }
    StoryViewer.#criarDOM();
    StoryViewer.#cacheEls();
    StoryViewer.#bindEventos();
  }

  static #criarDOM() {
    const overlay  = document.createElement('div');
    overlay.id     = 'sv-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'sv-backdrop';

    const svCard = document.createElement('div');
    svCard.className = 'sv-card';

    const btnPrev = document.createElement('button');
    btnPrev.id    = 'sv-prev';
    btnPrev.className = 'sv-nav sv-nav-prev';
    btnPrev.setAttribute('aria-label', 'Story anterior');
    btnPrev.textContent = '\u2039';

    const btnNext = document.createElement('button');
    btnNext.id    = 'sv-next';
    btnNext.className = 'sv-nav sv-nav-next';
    btnNext.setAttribute('aria-label', 'Próximo story');
    btnNext.textContent = '\u203a';

    const stage = document.createElement('div');
    stage.className = 'sv-stage';

    const innerA = StoryViewer.#criarInner('sv-inner-a');
    const innerB = StoryViewer.#criarInner('sv-inner-b');

    stage.append(innerA, innerB);
    svCard.append(btnPrev, stage, btnNext);
    overlay.append(backdrop, svCard);
    document.body.appendChild(overlay);
  }

  static #criarInner(id) {
    const inner = document.createElement('div');
    inner.id    = id;
    inner.className = 'sv-inner';

    const video = document.createElement('video');
    video.className = 'sv-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay',    '');
    video.setAttribute('loop',        '');

    const svTop = document.createElement('div');
    svTop.className = 'sv-top';

    const badge = document.createElement('img');
    badge.className = 'sv-badge';
    badge.alt = '';

    const svInfo = document.createElement('div');
    svInfo.className = 'sv-info';

    const nome = document.createElement('p');
    nome.className = 'sv-nome';

    const addr = document.createElement('p');
    addr.className = 'sv-addr';

    const btnFechar = document.createElement('button');
    btnFechar.className = 'sv-fechar';
    btnFechar.setAttribute('aria-label', 'Fechar');
    btnFechar.textContent = '\u2715';
    btnFechar.addEventListener('click', () => StoryViewer.fechar());

    svInfo.append(nome, addr);
    svTop.append(badge, svInfo, btnFechar);

    const svBottom = document.createElement('div');
    svBottom.className = 'sv-bottom';

    const likeBtn = document.createElement('button');
    likeBtn.className = 'sv-like-btn';
    likeBtn.setAttribute('aria-label', 'Curtir story');

    const likeImg = document.createElement('img');
    likeImg.src = '/shared/img/icones_curtir.png';
    likeImg.alt = 'curtir';

    const likeCount = document.createElement('span');
    likeCount.textContent = '0';

    likeBtn.append(likeImg, likeCount);
    likeBtn.addEventListener('click', () => StoryViewer.toggleLike());

    // ── Botão comentar ──
    const comentarBtn = document.createElement('button');
    comentarBtn.className = 'sv-comentar-btn';
    comentarBtn.setAttribute('aria-label', 'Comentar story');
    comentarBtn.innerHTML = '<img src="/shared/img/mensagen.svg" alt="comentar" onerror="this.outerHTML=\'\u{1F4AC}\'"> <span>Comentar</span>';
    comentarBtn.addEventListener('click', () => StoryViewer.#abrirPainelComentario());

    svBottom.append(likeBtn, comentarBtn);

    // ── Painel de comentários (slide-up) ──
    const comentPanel = document.createElement('div');
    comentPanel.className = 'sv-comment-panel';
    comentPanel.setAttribute('aria-hidden', 'true');

    const comentHeader = document.createElement('div');
    comentHeader.className = 'sv-comment-header';
    const comentTitulo = document.createElement('span');
    comentTitulo.textContent = 'Comentários';
    const comentFechar = document.createElement('button');
    comentFechar.className = 'sv-comment-fechar';
    comentFechar.textContent = '✕';
    comentFechar.addEventListener('click', () => StoryViewer.#fecharPainelComentario(inner));
    comentHeader.append(comentTitulo, comentFechar);

    const comentLista = document.createElement('div');
    comentLista.className = 'sv-comment-lista';

    const comentInputWrap = document.createElement('div');
    comentInputWrap.className = 'sv-comment-input-wrap';
    const comentInput = document.createElement('input');
    comentInput.type = 'text';
    comentInput.className = 'sv-comment-input';
    comentInput.setAttribute('placeholder', 'Escreva um comentário...');
    comentInput.setAttribute('maxlength', '500');
    const comentEnviar = document.createElement('button');
    comentEnviar.className = 'sv-comment-enviar';
    comentEnviar.textContent = 'Enviar';
    comentEnviar.addEventListener('click', () => StoryViewer.#enviarComentario(inner));
    comentInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') StoryViewer.#enviarComentario(inner);
    });
    comentInputWrap.append(comentInput, comentEnviar);

    comentPanel.append(comentHeader, comentLista, comentInputWrap);
    inner.append(video, svTop, svBottom, comentPanel);
    return inner;
  }

  static #cacheEls() {
    StoryViewer.#els.overlay  = document.getElementById('sv-overlay');
    StoryViewer.#els.backdrop = document.querySelector('#sv-overlay .sv-backdrop');
    StoryViewer.#els.svCard   = document.querySelector('#sv-overlay .sv-card');
    StoryViewer.#els.stage    = document.querySelector('#sv-overlay .sv-stage');
    StoryViewer.#els.innerA   = document.getElementById('sv-inner-a');
    StoryViewer.#els.innerB   = document.getElementById('sv-inner-b');
    StoryViewer.#els.prev     = document.getElementById('sv-prev');
    StoryViewer.#els.next     = document.getElementById('sv-next');
  }

  static #atualizarCacheAtivo() {
    const inner = StoryViewer.#ativo;
    if (!inner) return;
    StoryViewer.#els.video     = inner.querySelector('.sv-video');
    StoryViewer.#els.badge     = inner.querySelector('.sv-badge');
    StoryViewer.#els.nome      = inner.querySelector('.sv-nome');
    StoryViewer.#els.addr      = inner.querySelector('.sv-addr');
    StoryViewer.#els.likeBtn   = inner.querySelector('.sv-like-btn');
    StoryViewer.#els.likeCount = inner.querySelector('.sv-like-btn span');
    StoryViewer.#els.likeImg   = inner.querySelector('.sv-like-btn img');
    StoryViewer.#els.btnFechar   = inner.querySelector('.sv-fechar');
    StoryViewer.#els.btnComentar = inner.querySelector('.sv-comentar-btn');
  }

  // ── PRIVADO — Renderização ─────────────────────────────────

  static #lerCard(idx = StoryViewer.#idx) {
    const card = StoryViewer.#cards[idx];
    const vid  = card?.querySelector('.story-video');
    return {
      storyId:   card?.dataset.storyId                                              || null,
      ownerId:   card?.dataset.ownerId                                              || null,
      videoSrc:  vid?.src                                                           || '',
      poster:    vid?.getAttribute('poster')                                      || '',
      badgeSrc:  card?.querySelector('.story-shop-badge')?.src                   || '',
      nome:      card?.querySelector('.story-card-name')?.textContent             || '',
      addr:      card?.querySelector('.story-card-addr')?.textContent             || '',
      likeCount: card?.querySelector('.story-like-count')?.textContent            || '0',
      curtido:   card?.querySelector('.story-like-btn')?.classList.contains('curtido') ?? false,
    };
  }

  static #preencherInner(inner, dados) {
    const video     = inner.querySelector('.sv-video');
    const badge     = inner.querySelector('.sv-badge');
    const nome      = inner.querySelector('.sv-nome');
    const addr      = inner.querySelector('.sv-addr');
    const likeBtn   = inner.querySelector('.sv-like-btn');
    const likeCount = inner.querySelector('.sv-like-btn span');

    video.pause();
    video.poster = dados.poster;
    video.src    = dados.videoSrc;

    badge.src             = dados.badgeSrc;
    nome.textContent      = dados.nome;
    addr.textContent      = dados.addr;
    likeCount.textContent = dados.likeCount;
    likeBtn.classList.toggle('curtido', dados.curtido);
  }

  static #renderizar() {
    StoryViewer.#atualizarCacheAtivo();
    const dados = StoryViewer.#lerCard();
    StoryViewer.#storyId = dados.storyId;
    StoryViewer.#ownerId = dados.ownerId;
    StoryViewer.#preencherInner(StoryViewer.#ativo, dados);
    StoryViewer.#els.video?.play().catch(() => {});
    StoryViewer.#atualizarNavegacao();
  }

  static #precarregarProx(idx, dir) {
    StoryViewer.#preencherInner(StoryViewer.#prox, StoryViewer.#lerCard(idx));

    const ww = window.innerWidth;
    StoryViewer.#prox.style.transition = '';
    StoryViewer.#prox.style.transform  = `translateX(${dir * ww}px) rotateY(${-5 * dir}deg) scale(0.88)`;
    StoryViewer.#prox.style.opacity    = '0.28';
    StoryViewer.#prox.style.setProperty('--sv-darken', '0.2');
    StoryViewer.#prox.style.zIndex     = '2';
    StoryViewer.#ativo.style.zIndex    = '1';
    StoryViewer.#prox.style.display    = '';
  }

  static #atualizarNavegacao() {
    const { prev, next } = StoryViewer.#els;
    if (prev) prev.style.visibility = StoryViewer.#idx > 0 ? '' : 'hidden';
    if (next) next.style.visibility = StoryViewer.#idx < StoryViewer.#cards.length - 1 ? '' : 'hidden';
  }

  // ── PRIVADO — Animação 3D ──────────────────────────────────

  static async #transicao3D(dir) {
    StoryViewer.#precarregarProx(StoryViewer.#idx, dir);
    StoryViewer.#els.video?.pause();

    await StorySwipeTransition.completar(
      StoryViewer.#ativo,
      StoryViewer.#prox,
      dir,
      window.innerWidth,
    );

    StoryViewer.#concluirNavegacao();
  }

  static #concluirNavegacao() {
    [StoryViewer.#ativo, StoryViewer.#prox] = [StoryViewer.#prox, StoryViewer.#ativo];

    StorySwipeTransition.limpar(StoryViewer.#prox);
    StoryViewer.#prox.style.display = 'none';

    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StoryViewer.#atualizarCacheAtivo();
    StoryViewer.#els.video?.play().catch(() => {});
    StoryViewer.#atualizarNavegacao();
    StoryProgressLayer.render(StoryViewer.#els.stage, StoryViewer.#cards.length, StoryViewer.#idx);
  }

  // ── PRIVADO — Overlay ──────────────────────────────────────

  static #abrirOverlay() {
    const { overlay } = StoryViewer.#els;
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    overlay.classList.add('sv-ativo');
    document.body.style.overflow = 'hidden';
  }

  static #fecharOverlay() {
    const { overlay } = StoryViewer.#els;
    overlay.classList.remove('sv-ativo');
    setTimeout(() => {
      overlay.style.display        = '';
      document.body.style.overflow = '';
    }, 300);
  }

  // ── PRIVADO — Eventos ──────────────────────────────────────

  static #bindEventos() {
    StoryViewer.#els.backdrop.addEventListener('click', () => StoryViewer.fechar());
    StoryViewer.#els.prev.addEventListener('click',     () => StoryViewer.prev());
    StoryViewer.#els.next.addEventListener('click',     () => StoryViewer.next());
    StoryViewer.#bindSwipe();
    StoryViewer.#bindTeclado();
  }

  static #bindSwipe() {
    const { stage } = StoryViewer.#els;

    stage.addEventListener('touchstart', e => {
      if (StoryViewer.#flipping) return;
      StoryViewer.#swipeStartX = e.changedTouches[0].clientX;
      StoryViewer.#swipeDx     = 0;
      StoryViewer.#swipeAtivo  = false;
      StoryViewer.#swipeDir    = 0;
    }, { passive: true });

    stage.addEventListener('touchmove', e => {
      if (StoryViewer.#flipping) return;

      const dx = e.changedTouches[0].clientX - StoryViewer.#swipeStartX;
      StoryViewer.#swipeDx = dx;

      if (!StoryViewer.#swipeAtivo && Math.abs(dx) > 8) {
        const dir     = dx < 0 ? +1 : -1;
        const proxIdx = StoryViewer.#idx + dir;
        if (proxIdx < 0 || proxIdx >= StoryViewer.#cards.length) return;

        StoryViewer.#swipeDir   = dir;
        StoryViewer.#swipeAtivo = true;
        StoryViewer.#precarregarProx(proxIdx, dir);
      }

      if (!StoryViewer.#swipeAtivo) return;

      StorySwipeTransition.aplicarSwipe(
        StoryViewer.#ativo,
        StoryViewer.#prox,
        dx,
        window.innerWidth,
        StoryViewer.#swipeDir,
      );
    }, { passive: true });

    stage.addEventListener('touchend', async () => {
      if (!StoryViewer.#swipeAtivo || StoryViewer.#flipping) {
        StoryViewer.#swipeAtivo = false;
        return;
      }

      const dx  = StoryViewer.#swipeDx;
      const dir = StoryViewer.#swipeDir;
      StoryViewer.#swipeAtivo = false;

      if (Math.abs(dx) >= StoryViewer.#SWIPE_MIN) {
        StoryViewer.#flipping = true;
        StoryViewer.#idx += dir;
        await StorySwipeTransition.completar(
          StoryViewer.#ativo,
          StoryViewer.#prox,
          dir,
          window.innerWidth,
        );
        StoryViewer.#concluirNavegacao();
        StoryViewer.#flipping = false;
      } else {
        await StorySwipeTransition.cancelar(
          StoryViewer.#ativo,
          StoryViewer.#prox,
          dir,
          window.innerWidth,
        );
        StorySwipeTransition.limpar(StoryViewer.#ativo);
        StorySwipeTransition.limpar(StoryViewer.#prox);
        StoryViewer.#prox.style.display = 'none';
      }
    }, { passive: false });
  }

  static #bindTeclado() {
    document.addEventListener('keydown', e => {
      if (!StoryViewer.#els.overlay?.classList.contains('sv-ativo')) return;
      if (e.key === 'ArrowLeft')  StoryViewer.prev();
      if (e.key === 'ArrowRight') StoryViewer.next();
      if (e.key === 'Escape')     StoryViewer.fechar();
    });
  }

  // ─── COMENTÁRIOS ──────────────────────────────────────────

  /** Abre o painel de comentários do inner ativo e carrega os existentes. */
  static #abrirPainelComentario() {
    const inner = StoryViewer.#ativo;
    if (!inner) return;

    const panel = inner.querySelector('.sv-comment-panel');
    if (!panel) return;

    panel.classList.add('sv-comment-panel--aberto');
    panel.setAttribute('aria-hidden', 'false');

    // Pausa o vídeo enquanto painel estiver aberto
    StoryViewer.#els.video?.pause();

    // Carrega comentários existentes do story ativo
    StoryViewer.#carregarComentarios(inner);

    // Foca no input
    setTimeout(() => inner.querySelector('.sv-comment-input')?.focus(), 320);
  }

  /** Fecha o painel de comentários e retoma o vídeo. */
  static #fecharPainelComentario(inner) {
    const panel = inner?.querySelector('.sv-comment-panel');
    if (!panel) return;

    panel.classList.remove('sv-comment-panel--aberto');
    panel.setAttribute('aria-hidden', 'true');

    StoryViewer.#els.video?.play().catch(() => {});
  }

  /**
   * Carrega comentários do Supabase para o story ativo.
   * Em modo demo (sem banco), exibe mensagem vazia.
   *
   * @param {HTMLElement} inner
   */
  static async #carregarComentarios(inner) {
    const lista = inner.querySelector('.sv-comment-lista');
    if (!lista) return;

    lista.innerHTML = '';

    const storyId = StoryViewer.#storyId;
    if (!storyId || typeof MessageService === 'undefined') {
      const vazio = document.createElement('p');
      vazio.className   = 'sv-comment-vazio';
      vazio.textContent = 'Nenhum comentário ainda. Seja o primeiro!';
      lista.appendChild(vazio);
      return;
    }

    const { ok, data } = await MessageService.buscarComentariosStory(storyId);
    if (!ok || !data.length) {
      const vazio = document.createElement('p');
      vazio.className   = 'sv-comment-vazio';
      vazio.textContent = 'Nenhum comentário ainda. Seja o primeiro!';
      lista.appendChild(vazio);
      return;
    }

    data.forEach(c => lista.appendChild(StoryViewer.#criarItemComentario(c)));
    lista.scrollTop = lista.scrollHeight;
  }

  /**
   * Envia o comentário digitado no input.
   * Renderização otimista — item aparece imediatamente.
   *
   * @param {HTMLElement} inner
   */
  static async #enviarComentario(inner) {
    const input = inner?.querySelector('.sv-comment-input');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto) return;

    // Guard: anônimos não podem comentar
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', null)) return;

    input.value    = '';
    input.disabled = true;

    const storyId = StoryViewer.#storyId;
    const ownerId = StoryViewer.#ownerId;

    // Renderiza otimisticamente
    const lista = inner.querySelector('.sv-comment-lista');
    if (lista) {
      const mockComent = {
        content:    texto,
        created_at: new Date().toISOString(),
        profiles:   { full_name: 'Você', avatar_url: null },
      };
      lista.querySelector('.sv-comment-vazio')?.remove();
      const item = StoryViewer.#criarItemComentario(mockComent);
      item.classList.add('sv-comment-item--enviando');
      lista.appendChild(item);
      lista.scrollTop = lista.scrollHeight;

      // Persiste no banco
      if (storyId && ownerId && typeof MessageService !== 'undefined') {
        const { ok } = await MessageService.enviarComentarioStory(storyId, ownerId, texto);
        if (ok) {
          item.classList.remove('sv-comment-item--enviando');
        } else {
          item.style.opacity = '0.5';
          item.title         = 'Falha ao enviar. Tente novamente.';
        }
      }
    }

    input.disabled = false;
    input.focus();
  }

  /**
   * Cria um elemento DOM para um item de comentário.
   *
   * @param {{ content: string, created_at: string, profiles?: object }} c
   * @returns {HTMLElement}
   */
  static #criarItemComentario(c) {
    const item = document.createElement('div');
    item.className = 'sv-comment-item';

    const av = document.createElement('div');
    av.className = 'sv-comment-avatar';

    if (c.profiles?.avatar_url) {
      const img = document.createElement('img');
      img.src     = c.profiles.avatar_url;
      img.alt     = c.profiles.full_name ?? '';
      img.onerror = () => { img.remove(); av.textContent = (c.profiles.full_name ?? '?')[0]; };
      av.appendChild(img);
    } else {
      av.textContent = (c.profiles?.full_name ?? 'U')[0].toUpperCase();
    }

    const body = document.createElement('div');
    body.className = 'sv-comment-body';

    const nome = document.createElement('span');
    nome.className   = 'sv-comment-nome';
    nome.textContent = c.profiles?.full_name ?? 'Usuário';

    const texto = document.createElement('p');
    texto.className   = 'sv-comment-texto';
    texto.textContent = c.content;

    const hora = document.createElement('span');
    hora.className   = 'sv-comment-hora';
    hora.textContent = new Date(c.created_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });

    body.append(nome, texto, hora);
    item.append(av, body);
    return item;
  }
}
