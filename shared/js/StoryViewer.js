'use strict';

if (!window.StoryViewer) {

// =============================================================
// StorySwipeTransition — Animação pseudo-3D entre stories (POO)
//
// Responsabilidades:
//   aplicarSwipe — feedback visual em tempo real (sem transition, GPU puro)
//   completar    — finaliza a transição para o novo card
//   cancelar     — snap-back elástico (cubic-bezier spring) ao card original
//   limpar       — remove inline styles após transição
//
// Efeitos visuais:
//   · translateX  — desloca o card lateralmente
//   · rotateY     — leve inclinação em perspectiva (máx 14°)
//   · scale        — card saindo encolhe; card entrando cresce
//   · opacity      — fade cruzado
//   · --sv-darken  — overlay escuro via ::after do .sv-inner
// =============================================================

class StorySwipeTransition {

  static #DUR_COMPLETAR = 300;                               // ms
  static #DUR_CANCELAR  = 380;                               // ms
  static #EASE_SLIDE    = 'cubic-bezier(0.22,0.61,0.36,1)'; // fluido
  static #EASE_SPRING   = 'cubic-bezier(0.34,1.56,0.64,1)'; // elástico
  static #ROT_MAX       = 14;   // graus — sutil e premium
  static #SCALE_MIN     = 0.88; // escala mínima do card que sai
  static #OPACITY_MIN   = 0.28;
  static #DARKEN_MAX    = 0.44; // escurecimento máximo do overlay

  /**
   * Atualiza os dois cards em tempo real conforme o gesto.
   * Sem `transition` — apenas transform CPU→GPU por rAF.
   * @param {HTMLElement} ativo  — card visível
   * @param {HTMLElement} prox   — card standby (já posicionado off-screen)
   * @param {number}      dx     — px arrastados (negativo = esquerda)
   * @param {number}      ww     — largura do viewport
   * @param {number}      dir    — direção confirmada: +1 próx, -1 ant
   */
  static aplicarSwipe(ativo, prox, dx, ww, dir) {
    const p       = Math.min(Math.abs(dx) / ww, 1);
    const sinal   = dx < 0 ? -1 : 1;
    const rot     = p * StorySwipeTransition.#ROT_MAX * sinal;
    const scale   = 1 - p * (1 - StorySwipeTransition.#SCALE_MIN);
    const opacity = 1 - p * (1 - StorySwipeTransition.#OPACITY_MIN);
    const darken  = p * StorySwipeTransition.#DARKEN_MAX;

    // Card ativo: sai com translação + rotação + encolhimento + escurecimento
    ativo.style.transition = '';
    ativo.style.transform  = `translateX(${dx}px) rotateY(${rot}deg) scale(${scale})`;
    ativo.style.opacity    = opacity;
    ativo.style.setProperty('--sv-darken', darken);

    // Próximo card: parte de off-screen e se aproxima do centro
    // proxX = dir*ww + dx → quando dx atinge -dir*ww, proxX chega a 0
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

  /**
   * Completa a transição (swipe confirmado ou clique prev/next).
   * O card ativo sai; prox torna-se o card visível.
   * @returns {Promise} resolve ao fim da animação
   */
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

  /**
   * Cancela o swipe: snap-back elástico com overshoot suave.
   * @returns {Promise} resolve ao fim da animação
   */
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

  /** Remove todos os inline styles de transformação e escurecimento. */
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
//
// Responsabilidades:
//   render   — cria/atualiza pílulas dentro do .sv-stage
//   #criarDOM — injeção DOM idempotente (recria apenas quando o total muda)
// =============================================================

class StoryProgressLayer {

  static #MARCA = 'data-sp-total';

  /**
   * Cria ou atualiza o indicador de posição no stage.
   * @param {HTMLElement} stage — .sv-stage (pai das pílulas)
   * @param {number}      total — total de stories no container ativo
   * @param {number}      idx   — índice do story visível (0-based)
   */
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
// Responsabilidades (separadas por método privado):
//   #criarDOM()            — constrói toda a estrutura via createElement
//   #criarInner()          — cria um .sv-inner completo (video + top + bottom)
//   #cacheEls()            — armazena referências estruturais em #els
//   #atualizarCacheAtivo() — redireciona #els.video/badge/etc. para o inner ativo
//   #bindEventos()         — vincula eventos via addEventListener
//   #bindSwipe()           — swipe touch com touchmove em tempo real
//   #bindTeclado()         — atalhos de teclado (←→ Esc)
//   #lerCard()             — lê dados do card e retorna objeto de valor limpo
//   #preencherInner()      — aplica dados de card a um .sv-inner
//   #renderizar()          — renderiza o card ativo no inner atual
//   #precarregarProx()     — preloada e posiciona o inner standby off-screen
//   #transicao3D()         — orquestra a animação 3D para prev/next por botão
//   #atualizarNavegacao()  — controla visibilidade dos botões prev/next
//   #abrirOverlay()        — exibe overlay com transição CSS
//   #fecharOverlay()       — oculta overlay com transição CSS
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
  static #cards      = [];
  static #idx        = 0;
  static #flipping   = false;

  // ── Estado do swipe ────────────────────────────────────────
  static #swipeStartX = 0;  // X do toque inicial
  static #swipeDx     = 0;  // último dx registrado
  static #swipeAtivo  = false;
  static #swipeDir    = 0;  // +1 = próximo, -1 = anterior

  // ── Ponteiros para os dois inners (dual-buffer) ────────────
  static #ativo = null;  // inner visível atualmente
  static #prox  = null;  // inner em standby (off-screen ou display:none)

  // ── Referências DOM ────────────────────────────────────────
  static #els = {
    overlay:   null,
    backdrop:  null,
    svCard:    null,
    stage:     null,
    innerA:    null,
    innerB:    null,
    prev:      null,
    next:      null,
    // Campos atualizados por #atualizarCacheAtivo():
    video:     null,
    badge:     null,
    nome:      null,
    addr:      null,
    likeBtn:   null,
    likeCount: null,
    likeImg:   null,
    btnFechar: null,
  };

  // ── Constantes ─────────────────────────────────────────────
  static #SWIPE_MIN = 44;  // px mínimos para confirmar swipe

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

    StoryViewer.#cards = [...container.querySelectorAll('.story-card')];
    StoryViewer.#idx   = StoryViewer.#cards.indexOf(cardEl);

    StoryViewer.#garantirDOM();

    // Reinicia ponteiros sempre que o viewer é aberto
    StoryViewer.#ativo = StoryViewer.#els.innerA;
    StoryViewer.#prox  = StoryViewer.#els.innerB;

    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StorySwipeTransition.limpar(StoryViewer.#prox);
    StoryViewer.#prox.style.display = 'none';

    StoryViewer.#renderizar();
    StoryProgressLayer.render(StoryViewer.#els.stage, StoryViewer.#cards.length, StoryViewer.#idx);
    StoryViewer.#abrirOverlay();
  }

  /** Fecha o viewer e pausa o vídeo atual. */
  static fechar() {
    if (!StoryViewer.#els.overlay) return;
    StoryViewer.#els.video?.pause();
    StoryViewer.#flipping   = false;
    StoryViewer.#swipeAtivo = false;
    StoryViewer.#fecharOverlay();
  }

  /** Vai para o story anterior com animação 3D. */
  static async prev() {
    if (StoryViewer.#flipping || StoryViewer.#idx <= 0) return;
    StoryViewer.#flipping = true;
    StoryViewer.#idx--;
    await StoryViewer.#transicao3D(-1);
    StoryViewer.#flipping = false;
  }

  /** Vai para o próximo story com animação 3D. */
  static async next() {
    if (StoryViewer.#flipping || StoryViewer.#idx >= StoryViewer.#cards.length - 1) return;
    StoryViewer.#flipping = true;
    StoryViewer.#idx++;
    await StoryViewer.#transicao3D(+1);
    StoryViewer.#flipping = false;
  }

  /**
   * Alterna curtida no viewer e sincroniza com o card da lista.
   */
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

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Bootstrap do DOM
  // ═══════════════════════════════════════════════════════════

  /** Garante que o overlay existe — cria apenas uma vez. */
  static #garantirDOM() {
    if (document.getElementById('sv-overlay')) {
      StoryViewer.#cacheEls();
      return;
    }
    StoryViewer.#criarDOM();
    StoryViewer.#cacheEls();
    StoryViewer.#bindEventos();
  }

  /** Constrói toda a estrutura do viewer via createElement. ZERO innerHTML. */
  static #criarDOM() {
    const overlay  = document.createElement('div');
    overlay.id     = 'sv-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'sv-backdrop';

    // Card central
    const svCard = document.createElement('div');
    svCard.className = 'sv-card';

    const btnPrev = document.createElement('button');
    btnPrev.id    = 'sv-prev';
    btnPrev.className = 'sv-nav sv-nav-prev';
    btnPrev.setAttribute('aria-label', 'Story anterior');
    btnPrev.textContent = '‹';

    const btnNext = document.createElement('button');
    btnNext.id    = 'sv-next';
    btnNext.className = 'sv-nav sv-nav-next';
    btnNext.setAttribute('aria-label', 'Próximo story');
    btnNext.textContent = '›';

    // Stage: perspective container com dois inners (dual-buffer)
    const stage = document.createElement('div');
    stage.className = 'sv-stage';

    const innerA = StoryViewer.#criarInner('sv-inner-a');
    const innerB = StoryViewer.#criarInner('sv-inner-b');

    stage.append(innerA, innerB);
    svCard.append(btnPrev, stage, btnNext);
    overlay.append(backdrop, svCard);
    document.body.appendChild(overlay);
  }

  /**
   * Cria um .sv-inner completo: video + .sv-top + .sv-bottom.
   * @param {string} id
   */
  static #criarInner(id) {
    const inner = document.createElement('div');
    inner.id    = id;
    inner.className = 'sv-inner';

    // Vídeo
    const video = document.createElement('video');
    video.className = 'sv-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay',    '');
    video.setAttribute('loop',        '');

    // Topo: badge + info + fechar
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
    btnFechar.textContent = '✕';
    btnFechar.addEventListener('click', () => StoryViewer.fechar());

    svInfo.append(nome, addr);
    svTop.append(badge, svInfo, btnFechar);

    // Base: curtir
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

    svBottom.appendChild(likeBtn);
    inner.append(video, svTop, svBottom);
    return inner;
  }

  /** Popula #els com as referências estruturais. */
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

  /**
   * Redireciona os campos dinâmicos (#els.video, badge, etc.) para os
   * filhos do inner ativo. Chamado após cada swap de ponteiros.
   */
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
    StoryViewer.#els.btnFechar = inner.querySelector('.sv-fechar');
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Renderização
  // ═══════════════════════════════════════════════════════════

  /**
   * Lê os dados do card indicado.
   * @param {number} idx — índice em #cards (default: #idx)
   */
  static #lerCard(idx = StoryViewer.#idx) {
    const card = StoryViewer.#cards[idx];
    const vid  = card?.querySelector('.story-video');
    return {
      videoSrc:  vid?.src                        || '',
      poster:    vid?.getAttribute('poster')     || '',
      badgeSrc:  card?.querySelector('.story-shop-badge')?.src        || '',
      nome:      card?.querySelector('.story-card-name')?.textContent || '',
      addr:      card?.querySelector('.story-card-addr')?.textContent || '',
      likeCount: card?.querySelector('.story-like-count')?.textContent || '0',
      curtido:   card?.querySelector('.story-like-btn')?.classList.contains('curtido') ?? false,
    };
  }

  /**
   * Preenche os sub-elementos de um inner com os dados fornecidos.
   * NÃO inicia reprodução — responsabilidade do chamador.
   */
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

  /** Renderiza o card atual no inner ativo. */
  static #renderizar() {
    StoryViewer.#atualizarCacheAtivo();
    StoryViewer.#preencherInner(StoryViewer.#ativo, StoryViewer.#lerCard());
    StoryViewer.#els.video?.play().catch(() => {});
    StoryViewer.#atualizarNavegacao();
  }

  /**
   * Preenche o inner standby e o posiciona off-screen, pronto para entrar.
   * @param {number} idx — índice do card a pré-carregar
   * @param {number} dir — +1 ou -1
   */
  static #precarregarProx(idx, dir) {
    StoryViewer.#preencherInner(StoryViewer.#prox, StoryViewer.#lerCard(idx));

    const ww = window.innerWidth;
    // Posição inicial fora da tela sem transition
    StoryViewer.#prox.style.transition = '';
    StoryViewer.#prox.style.transform  = `translateX(${dir * ww}px) rotateY(${-5 * dir}deg) scale(0.88)`;
    StoryViewer.#prox.style.opacity    = '0.28';
    StoryViewer.#prox.style.setProperty('--sv-darken', '0.2');
    StoryViewer.#prox.style.zIndex     = '2';  // prox aparece à frente durante entrada
    StoryViewer.#ativo.style.zIndex    = '1';
    StoryViewer.#prox.style.display    = '';
  }

  /** Atualiza visibilidade dos botões de navegação. */
  static #atualizarNavegacao() {
    const { prev, next } = StoryViewer.#els;
    if (prev) prev.style.visibility = StoryViewer.#idx > 0 ? '' : 'hidden';
    if (next) next.style.visibility = StoryViewer.#idx < StoryViewer.#cards.length - 1 ? '' : 'hidden';
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Animação 3D
  // ═══════════════════════════════════════════════════════════

  /**
   * Orquestra a transição 3D ao clicar prev/next.
   * O #idx já foi atualizado pelo chamador antes desta chamada.
   * @param {number} dir — +1 ou -1
   */
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

  /**
   * Finaliza o estado após qualquer transição concluída (botão ou swipe).
   * Troca ponteiros, limpa styles, retoma vídeo, atualiza UI.
   */
  static #concluirNavegacao() {
    [StoryViewer.#ativo, StoryViewer.#prox] = [StoryViewer.#prox, StoryViewer.#ativo];

    // Limpa e oculta o antigo ativo (agora referenciado por #prox)
    StorySwipeTransition.limpar(StoryViewer.#prox);
    StoryViewer.#prox.style.display = 'none';

    // Limpa o novo ativo e retoma reprodução
    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StoryViewer.#atualizarCacheAtivo();
    StoryViewer.#els.video?.play().catch(() => {});
    StoryViewer.#atualizarNavegacao();
    StoryProgressLayer.render(StoryViewer.#els.stage, StoryViewer.#cards.length, StoryViewer.#idx);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Overlay
  // ═══════════════════════════════════════════════════════════

  static #abrirOverlay() {
    const { overlay } = StoryViewer.#els;
    overlay.style.display = 'flex';
    void overlay.offsetWidth;           // força reflow para CSS transition
    overlay.classList.add('sv-ativo');
    document.body.style.overflow = 'hidden';
  }

  static #fecharOverlay() {
    const { overlay } = StoryViewer.#els;
    overlay.classList.remove('sv-ativo');
    setTimeout(() => {
      overlay.style.display    = '';
      document.body.style.overflow = '';
    }, 300);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Eventos
  // ═══════════════════════════════════════════════════════════

  static #bindEventos() {
    StoryViewer.#els.backdrop.addEventListener('click', () => StoryViewer.fechar());
    StoryViewer.#els.prev.addEventListener('click',     () => StoryViewer.prev());
    StoryViewer.#els.next.addEventListener('click',     () => StoryViewer.next());
    StoryViewer.#bindSwipe();
    StoryViewer.#bindTeclado();
  }

  /**
   * Swipe horizontal com rastreamento em tempo real via touchmove.
   * · touchstart  — captura X inicial
   * · touchmove   — feedback visual a cada frame; preloada o prox na 1ª chamada
   * · touchend    — confirma navegação ou dispara snap-back elástico
   */
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

      // Primeira call com deslocamento relevante: define direção e pré-carrega
      if (!StoryViewer.#swipeAtivo && Math.abs(dx) > 8) {
        const dir     = dx < 0 ? +1 : -1;  // dx<0 = arrasta esq = próximo
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
        // ── Swipe confirmado: navega ──────────────────────────
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
        // ── Swipe cancelado: snap-back elástico ───────────────
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

  /** Atalhos de teclado — ativos apenas quando o overlay está aberto. */
  static #bindTeclado() {
    document.addEventListener('keydown', e => {
      if (!StoryViewer.#els.overlay?.classList.contains('sv-ativo')) return;
      if (e.key === 'ArrowLeft')  StoryViewer.prev();
      if (e.key === 'ArrowRight') StoryViewer.next();
      if (e.key === 'Escape')     StoryViewer.fechar();
    });
  }
}

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

  window.StoryViewer = StoryViewer;
}

var StoryViewer = window.StoryViewer;
