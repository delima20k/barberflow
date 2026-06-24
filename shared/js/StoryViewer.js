// =============================================================
// StorySwipeTransition — Cubo 3D real entre stories (POO)
// Perspective injetada pelo CSS .sv-stage (1200px) — não inline.
// Cards giram em torno do eixo Y como faces de um cubo.
// =============================================================

class StorySwipeTransition {

  static #DUR_COMPLETAR = 350;
  static #DUR_CANCELAR  = 380;
  static #EASE_SLIDE    = 'cubic-bezier(0.22,0.61,0.36,1)';
  static #EASE_SPRING   = 'cubic-bezier(0.34,1.56,0.64,1)';
  // Ângulo máximo do cubo. 85° (não 90°) evita "passar por trás" em devices lentos.
  static #ROT_MAX       = 85;
  static #OPACITY_MIN   = 0.28;
  static #DARKEN_MAX    = 0.44;

  /**
   * Animação em tempo real durante o arrasto do dedo.
   * Ativo gira para fora; prox gira para dentro — sem translateX.
   */
  static aplicarSwipe(ativo, prox, dx, _ww, dir) {
    const p     = Math.min(Math.abs(dx) / (_ww || window.innerWidth), 1);
    // Ativo sai na direção do swipe
    const rotAtivo = p * StorySwipeTransition.#ROT_MAX * (dx < 0 ? 1 : -1);
    const opAtivo  = 1 - p * (1 - StorySwipeTransition.#OPACITY_MIN);
    const darken   = p * StorySwipeTransition.#DARKEN_MAX;

    ativo.style.transition = '';
    ativo.style.transform  = `rotateY(${rotAtivo}deg)`;
    ativo.style.opacity    = opAtivo;
    ativo.style.setProperty('--sv-darken', darken);

    // Prox entra da direção oposta
    const rotProx = (1 - p) * StorySwipeTransition.#ROT_MAX * (dx < 0 ? -1 : 1);
    const opProx  = StorySwipeTransition.#OPACITY_MIN + p * (1 - StorySwipeTransition.#OPACITY_MIN);
    const darkenP = (1 - p) * StorySwipeTransition.#DARKEN_MAX * 0.35;

    prox.style.transition = '';
    prox.style.transform  = `rotateY(${rotProx}deg)`;
    prox.style.opacity    = opProx;
    prox.style.setProperty('--sv-darken', darkenP);
  }

  static completar(ativo, prox, dir, _ww) {
    const dur = StorySwipeTransition.#DUR_COMPLETAR;
    const e   = StorySwipeTransition.#EASE_SLIDE;
    const tr  = `transform ${dur}ms ${e}, opacity ${dur}ms ${e}`;

    ativo.style.transition = tr;
    ativo.style.transform  = `rotateY(${-dir * StorySwipeTransition.#ROT_MAX}deg)`;
    ativo.style.opacity    = StorySwipeTransition.#OPACITY_MIN;
    ativo.style.setProperty('--sv-darken', StorySwipeTransition.#DARKEN_MAX);

    prox.style.transition = tr;
    prox.style.transform  = 'rotateY(0deg)';
    prox.style.opacity    = '1';
    prox.style.setProperty('--sv-darken', 0);

    return new Promise(r => setTimeout(r, dur));
  }

  static cancelar(ativo, prox, dir, _ww) {
    const dur = StorySwipeTransition.#DUR_CANCELAR;
    const e   = StorySwipeTransition.#EASE_SPRING;
    const tr  = `transform ${dur}ms ${e}, opacity ${dur}ms ${e}`;

    ativo.style.transition = tr;
    ativo.style.transform  = 'rotateY(0deg)';
    ativo.style.opacity    = '1';
    ativo.style.setProperty('--sv-darken', 0);

    prox.style.transition = tr;
    prox.style.transform  = `rotateY(${dir * StorySwipeTransition.#ROT_MAX}deg)`;
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

  // Estado centralizado: barbearia e stories carregados (Ajuste 2)
  static #viewerState = {
    shopId:       null,
    stories:      [],
    currentIndex: 0,
    cardEl:       null,
    storyId:      null,
  };

  static #swipeStartX = 0;
  static #swipeDx     = 0;
  static #swipeAtivo  = false;
  static #swipeDir    = 0;

  static #ativo = null;
  static #prox  = null;

  static #fecharTimeoutId = null; // controla o setTimeout de #fecharOverlay
  static #flipping        = false;
  static #prismAtivo      = false;

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

  /**
   * Abre o viewer para a barbearia do card clicado.
   * Recupera todos os stories do StoriesStore.
   * Se o card tiver data-storyIdx, inicia no índice correto (modo individual).
   * Fallback (cards legacy/demo sem shopId): abre MediaViewer com o vídeo do card.
   * @param {Element} el — .story-card ou qualquer elemento filho
   */
  static abrir(el) {
    const cardEl = el?.closest?.('.story-card');
    if (!cardEl) return;

    const shopId  = cardEl.dataset.shopId;
    const ehFeedHome = cardEl.dataset.feedGroup === '1' && typeof StoriesStore !== 'undefined';

    let stories;
    let startIndex;

    if (ehFeedHome) {
      // Home: percorre TODOS os vídeos de TODAS as barbearias continuamente.
      // Concatena os stories de cada barbearia na ordem do feed e começa no
      // primeiro vídeo da barbearia clicada. Sem precisar clicar em outro card.
      const ordem = StoriesStore.getFeedOrder();
      const combinado = [];
      let inicioBarbearia = 0;
      for (const sid of ordem) {
        const lista = StoriesStore.get(sid);
        if (!lista.length) continue;
        if (sid === shopId) inicioBarbearia = combinado.length;
        combinado.push(...lista);
      }
      stories = combinado.length ? combinado : StoriesStore.get(shopId);
      startIndex = combinado.length ? inicioBarbearia : 0;
    } else {
      stories = (shopId && typeof StoriesStore !== 'undefined')
        ? StoriesStore.get(shopId)
        : [];
      // Suporte a data-storyIdx: cards individuais (barbearia pública / minha barbearia)
      const rawIdx = parseInt(cardEl.dataset.storyIdx ?? '0', 10);
      startIndex = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < stories.length
        ? rawIdx
        : 0;
    }

    // Fallback: card legacy / demo sem stories no cache → MediaViewer
    if (!stories.length) {
      const video = cardEl.querySelector('.story-video');
      const src   = video?.src;
      if (src && typeof MediaViewer !== 'undefined') {
        MediaViewer.getInstance().open({ type: 'video', src, poster: video.poster ?? '' });
      }
      return;
    }

    // Estado centralizado — 1 card = 1 barbearia = N stories
    StoryViewer.#viewerState = {
      shopId,
      stories,
      currentIndex: startIndex,
      cardEl,
      storyId: stories[startIndex]?.id ?? null,
    };

    if (typeof MediaPrismViewer !== 'undefined') {
      StoryViewer.#prismAtivo = true;
      MediaPrismViewer.get().open({
        mode: 'story',
        items: stories,
        startIndex,
      });
      return;
    }

    StoryViewer.#garantirDOM();

    StoryViewer.#ativo = StoryViewer.#els.innerA;
    StoryViewer.#prox  = StoryViewer.#els.innerB;

    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StorySwipeTransition.limpar(StoryViewer.#prox);
    StoryViewer.#prox.style.display = 'none';

    StoryViewer.#renderizar();
    StoryProgressLayer.render(
      StoryViewer.#els.stage,
      stories.length,
      startIndex,
    );
    StoryViewer.#abrirOverlay();
  }

  static fechar() {
    if (StoryViewer.#prismAtivo && typeof MediaPrismViewer !== 'undefined') {
      MediaPrismViewer.get().close();
      StoryViewer.#prismAtivo = false;
      return;
    }
    if (!StoryViewer.#els.overlay) return;

    // Pausa e libera vídeo de ambos os inners (Ajuste 7 — cleanup obrigatório)
    for (const inner of [StoryViewer.#els.innerA, StoryViewer.#els.innerB]) {
      if (!inner) continue;
      const v = inner.querySelector('.sv-video');
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.remove();
        delete v.dataset.observerBound;
      }
    }

    // Remove botão de som residual
    StoryViewer.#els.overlay.querySelector('.sv-sound-btn')?.remove();

    StoryViewer.#flipping   = false;
    StoryViewer.#swipeAtivo = false;
    StoryViewer.#fecharOverlay();
  }

  static async prev() {
    if (StoryViewer.#prismAtivo && typeof MediaPrismViewer !== 'undefined') {
      MediaPrismViewer.get().prev();
      return;
    }
    const { currentIndex } = StoryViewer.#viewerState;
    if (StoryViewer.#flipping || currentIndex <= 0) return;
    StoryViewer.#flipping = true;
    StoryViewer.#viewerState.currentIndex--;
    await StoryViewer.#transicao3D(-1);
    StoryViewer.#flipping = false;
  }

  static async next() {
    if (StoryViewer.#prismAtivo && typeof MediaPrismViewer !== 'undefined') {
      MediaPrismViewer.get().next();
      return;
    }
    const { currentIndex, stories } = StoryViewer.#viewerState;
    if (StoryViewer.#flipping || currentIndex >= stories.length - 1) return;
    StoryViewer.#flipping = true;
    StoryViewer.#viewerState.currentIndex++;
    await StoryViewer.#transicao3D(+1);
    StoryViewer.#flipping = false;
  }

  static async toggleLike() {
    // Guard: anônimos não podem curtir stories
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', null)) return;

    const { likeBtn, likeCount } = StoryViewer.#els;
    if (!likeBtn || !likeCount) return;
    const { stories, currentIndex } = StoryViewer.#viewerState;
    const story = stories[currentIndex];
    if (!story?.media_id || typeof BffApiService === 'undefined' || !BffApiService.media?.toggleStoryLike) return;
    if (likeBtn.disabled) return;

    const curtido = likeBtn.classList.toggle('curtido');
    const valorAnterior = parseInt(likeCount.textContent, 10) || 0;
    const curtidoAnterior = Boolean(story.user_liked);
    const novoVal = Math.max(0, valorAnterior + (curtido ? 1 : -1));
    likeCount.textContent = novoVal;
    story.user_liked = curtido;
    story.likes_count = novoVal;

    // Notifica o card de origem via CustomEvent (sem acoplamento direto — Ajuste 5)
    StoryViewer.#emitLike(curtido, novoVal);

    likeBtn.disabled = true;
    const { data, error } = await BffApiService.media.toggleStoryLike(story.media_id);
    likeBtn.disabled = false;
    if (error) {
      story.user_liked = curtidoAnterior;
      story.likes_count = valorAnterior;
      likeBtn.classList.toggle('curtido', curtidoAnterior);
      likeCount.textContent = String(valorAnterior);
      StoryViewer.#emitLike(curtidoAnterior, valorAnterior);
      return;
    }

    const countFinal = Math.max(0, Number(data?.likes_count ?? novoVal));
    const likedFinal = Boolean(data?.user_liked ?? curtido);
    story.user_liked = likedFinal;
    story.likes_count = countFinal;
    likeBtn.classList.toggle('curtido', likedFinal);
    likeCount.textContent = String(countFinal);
    StoryViewer.#emitLike(likedFinal, countFinal);
  }

  static #emitLike(curtido, count) {
    const { cardEl, shopId, currentIndex, stories } = StoryViewer.#viewerState;
    const story = stories[currentIndex] ?? {};
    cardEl?.dispatchEvent(new CustomEvent('story:like', {
      bubbles: true,
      detail: {
        shopId,
        storyIndex: currentIndex,
        storyId: story.id ?? null,
        mediaId: story.media_id ?? null,
        curtido,
        count,
      },
    }));
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
    video.setAttribute('loop',        '');
    video.controls = true;
    video.muted    = false;

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

    // Primeira linha do topo: badge + info + fechar
    const svTopRow = document.createElement('div');
    svTopRow.className = 'sv-top-row';
    svTopRow.append(badge, svInfo, btnFechar);

    // Segunda linha do topo: avatar + nome do barbeiro (visível apenas em stories de parceiro)
    const svBarberOverlay = document.createElement('div');
    svBarberOverlay.className = 'sv-barber-overlay';
    const svBarberAvatar = document.createElement('img');
    svBarberAvatar.className = 'sv-barber-avatar';
    svBarberAvatar.alt = '';
    svBarberAvatar.style.display = 'none';
    const svBarberName = document.createElement('span');
    svBarberName.className = 'sv-barber-name';
    svBarberOverlay.append(svBarberAvatar, svBarberName);

    svTop.append(svTopRow, svBarberOverlay);

    const svBottom = document.createElement('div');
    svBottom.className = 'sv-bottom';

    const likeBtn = document.createElement('button');
    likeBtn.className = 'sv-like-btn';
    likeBtn.setAttribute('aria-label', 'Curtir story');

    const likeIcon = document.createElement('span');
    likeIcon.className = 'sv-like-icon';
    likeIcon.textContent = '💎';

    const likeCount = document.createElement('span');
    likeCount.textContent = '0';

    likeBtn.append(likeIcon, likeCount);
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
    StoryViewer.#els.likeImg   = inner.querySelector('.sv-like-btn .sv-like-icon');
    StoryViewer.#els.btnFechar   = inner.querySelector('.sv-fechar');
    StoryViewer.#els.btnComentar = inner.querySelector('.sv-comentar-btn');
  }

  // ── PRIVADO — Renderização ─────────────────────────────────

  /**
   * Lê os dados do story a exibir a partir do estado centralizado.
   * @param {number} [idx] — índice do story (padrão: currentIndex)
   * @returns {object|null}
   */
  static #lerCard(idx = StoryViewer.#viewerState.currentIndex) {
    const { stories, cardEl } = StoryViewer.#viewerState;
    const story = stories[idx];
    if (!story) return null;

    return {
      storyId:          story.id          ?? null,
      ownerId:          story.owner_id    ?? null,
      videoSrc:         story.media_url   ?? '',
      poster:           story.thumbnail_url ?? story.thumbnail_path ?? '',
      badgeSrc:         StoryViewer.#identityBadge(story, cardEl),
      nome:             StoryViewer.#identityName(story, cardEl),
      addr:             cardEl?.querySelector('.story-card-addr')?.textContent ?? '',
      likeCount:        String(story.likes_count ?? 0),
      curtido:          Boolean(story.user_liked),
      barberNome:       story.tipo_autor === 'parceiro' ? (story.poster_name ?? null) : null,
      barberAvatarPath: story.tipo_autor === 'parceiro' ? (story.poster_avatar_path ?? null) : null,
    };
  }

  static #identityName(story, cardEl) {
    if (story.tipo_autor === 'parceiro') return story.poster_name ?? story.shop_name ?? '';
    return story.shop_name ?? cardEl?.querySelector('.story-card-name')?.textContent ?? '';
  }

  static #identityBadge(story, cardEl) {
    if (story.tipo_autor === 'parceiro' && story.poster_avatar_path) {
      return typeof ApiService !== 'undefined'
        ? ApiService.getAvatarUrl(story.poster_avatar_path)
        : story.poster_avatar_path;
    }
    if (story.shop_logo_path) {
      return typeof ApiService !== 'undefined'
        ? ApiService.getLogoUrl(story.shop_logo_path)
        : story.shop_logo_path;
    }
    return cardEl?.querySelector('.story-shop-badge')?.src ?? '';
  }

  static #preencherInner(inner, dados) {
    if (!dados) return;
    let video          = inner.querySelector('.sv-video');
    if (!video) {
      video = document.createElement('video');
      video.className = 'sv-video';
      video.setAttribute('playsinline', '');
      video.setAttribute('loop', '');
      video.controls = true;
      video.muted    = false;
      inner.insertBefore(video, inner.firstChild);
    }
    const badge        = inner.querySelector('.sv-badge');
    const nome         = inner.querySelector('.sv-nome');
    const addr         = inner.querySelector('.sv-addr');
    const likeBtn      = inner.querySelector('.sv-like-btn');
    const likeCount    = inner.querySelector('.sv-like-btn span');
    const barberAvatar = inner.querySelector('.sv-barber-avatar');
    const barberName   = inner.querySelector('.sv-barber-name');

    video.pause();
    video.muted    = false;
    video.controls = true;
    video.poster   = dados.poster;
    video.src      = dados.videoSrc;

    badge.src             = dados.badgeSrc;
    nome.textContent      = dados.nome;
    addr.textContent      = dados.addr;
    likeCount.textContent = dados.likeCount;
    likeBtn.classList.toggle('curtido', dados.curtido);

    // Avatar do barbeiro por vídeo (source: story.poster_avatar_path)
    const barberOverlay = inner.querySelector('.sv-barber-overlay');
    if (barberAvatar && dados.barberAvatarPath) {
      const avatarUrl = typeof ApiService !== 'undefined'
        ? ApiService.getAvatarUrl(dados.barberAvatarPath)
        : dados.barberAvatarPath;
      barberAvatar.src = avatarUrl;
      barberAvatar.style.display = '';
    } else if (barberAvatar) {
      barberAvatar.style.display = 'none';
    }
    if (barberName) {
      barberName.textContent = dados.barberNome ?? '';
    }
    // Oculta o container inteiro quando não há barbereiro identificado
    if (barberOverlay) {
      barberOverlay.hidden = !dados.barberNome && !dados.barberAvatarPath;
    }
  }

  static #renderizar() {
    const dados = StoryViewer.#lerCard();
    if (!dados) return;

    // Atualiza storyId no estado (usado pelos comentários)
    const { stories, currentIndex } = StoryViewer.#viewerState;
    StoryViewer.#viewerState.storyId = stories[currentIndex]?.id ?? null;

    StoryViewer.#preencherInner(StoryViewer.#ativo, dados);
    // Cache atualizado APÓS #preencherInner para capturar vídeo recriado
    StoryViewer.#atualizarCacheAtivo();
    StoryViewer.#reproduzirComSom(StoryViewer.#els.video);
    StoryViewer.#atualizarNavegacao();
    StoryProgressLayer.render(
      StoryViewer.#els.stage,
      stories.length,
      currentIndex,
    );
    // Preload do próximo story para evitar tela preta (Ajuste 4)
    StoryViewer.#preloadProximo();
  }

  static #precarregarProx(idx, dir) {
    StoryViewer.#preencherInner(StoryViewer.#prox, StoryViewer.#lerCard(idx));

    // Posiciona o próximo card na rotação oposta, pronto para entrar no cubo
    StoryViewer.#prox.style.transition = '';
    StoryViewer.#prox.style.transform  = `rotateY(${dir * 85}deg)`;
    StoryViewer.#prox.style.opacity    = '0.28';
    StoryViewer.#prox.style.setProperty('--sv-darken', '0.2');
    StoryViewer.#prox.style.zIndex     = '2';
    StoryViewer.#ativo.style.zIndex    = '1';
    StoryViewer.#prox.style.display    = '';
  }

  static #atualizarNavegacao() {
    const { prev, next } = StoryViewer.#els;
    const { currentIndex, stories } = StoryViewer.#viewerState;
    if (prev) prev.style.visibility = currentIndex > 0 ? '' : 'hidden';
    if (next) next.style.visibility = currentIndex < stories.length - 1 ? '' : 'hidden';
  }

  // ── PRIVADO — Animação 3D ──────────────────────────────────

  static async #transicao3D(dir) {
    StoryViewer.#precarregarProx(StoryViewer.#viewerState.currentIndex, dir);
    StoryViewer.#els.video?.pause();
    // Remove botão de som anterior antes de iniciar novo vídeo
    StoryViewer.#els.overlay?.querySelector('.sv-sound-btn')?.remove();

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

    // Limpa o src do buffer reutilizado (antigo ativo) para liberar memória
    const proxVideo = StoryViewer.#prox.querySelector('.sv-video');
    if (proxVideo) { proxVideo.removeAttribute('src'); }

    StorySwipeTransition.limpar(StoryViewer.#ativo);
    StoryViewer.#atualizarCacheAtivo();

    // Atualiza storyId no estado
    const { stories, currentIndex } = StoryViewer.#viewerState;
    StoryViewer.#viewerState.storyId = stories[currentIndex]?.id ?? null;

    // Remove botão de som residual e reproduz o novo vídeo com som
    StoryViewer.#els.overlay?.querySelector('.sv-sound-btn')?.remove();
    StoryViewer.#reproduzirComSom(StoryViewer.#els.video);
    StoryViewer.#atualizarNavegacao();
    StoryProgressLayer.render(
      StoryViewer.#els.stage,
      stories.length,
      currentIndex,
    );
    // Preload do próximo story (Ajuste 4)
    StoryViewer.#preloadProximo();
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
    if (StoryViewer.#fecharTimeoutId) {
      clearTimeout(StoryViewer.#fecharTimeoutId);
    }
    StoryViewer.#fecharTimeoutId = setTimeout(() => {
      StoryViewer.#fecharTimeoutId    = null;
      overlay.style.display           = '';
      document.body.style.overflow    = '';
    }, 300);
  }

  // ── PRIVADO — Reprodução com som + fallback (Ajuste 3 / Ajuste 7) ─────

  /**
   * Reproduz o vídeo com som. Se o browser bloquear (autoplay policy),
   * exibe o botão "🔊 Tocar com som". Nunca muta automaticamente.
   * @param {HTMLVideoElement|null} video
   */
  static #reproduzirComSom(video) {
    if (!video) return;
    video.muted = false;
    video.play().catch(err => {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        StoryViewer.#mostrarBotaoSom(video);
      }
    });
  }

  /**
   * Injeta botão "🔊 Tocar com som" no overlay.
   * Removido automaticamente ao fechar/navegar.
   * @param {HTMLVideoElement} video
   */
  static #mostrarBotaoSom(video) {
    if (!StoryViewer.#els.overlay) return;
    if (StoryViewer.#els.overlay.querySelector('.sv-sound-btn')) return;

    const btn = document.createElement('button');
    btn.className   = 'sv-sound-btn';
    btn.type        = 'button';
    btn.textContent = '🔊 Tocar com som';
    btn.addEventListener('click', () => {
      video.muted = false;
      video.play().catch(() => {});
      btn.remove();
    });
    StoryViewer.#els.overlay.appendChild(btn);
  }

  /**
   * Faz preload do próximo story no buffer prox (apenas src + metadata).
   * Evita tela preta na navegação para frente (Ajuste 4).
   */
  static #preloadProximo() {
    const { stories, currentIndex } = StoryViewer.#viewerState;
    const proxIdx = currentIndex + 1;
    if (proxIdx >= stories.length) return;

    const dados = StoryViewer.#lerCard(proxIdx);
    if (!dados?.videoSrc) return;

    const proxVideo = StoryViewer.#prox?.querySelector('.sv-video');
    if (proxVideo && !proxVideo.src) {
      proxVideo.preload = 'metadata';
      proxVideo.src     = dados.videoSrc;
    }
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
        const proxIdx = StoryViewer.#viewerState.currentIndex + dir;
        if (proxIdx < 0 || proxIdx >= StoryViewer.#viewerState.stories.length) return;

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
        StoryViewer.#viewerState.currentIndex += dir;
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

    const storyId = StoryViewer.#viewerState.storyId;
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

    const storyId = StoryViewer.#viewerState.storyId;
    const ownerId = StoryViewer.#viewerState.stories[StoryViewer.#viewerState.currentIndex]?.owner_id ?? null;

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

  static #initPrismLikeListener() {
    document.addEventListener('barberflow:prism-story-like', async (e) => {
      const { mediaId, item } = e.detail ?? {};
      if (!mediaId || typeof BffApiService === 'undefined') return;
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', null)) return;

      const prevLiked = Boolean(item.user_liked);
      const prevCount = Math.max(0, Number(item.likes_count ?? 0));

      const { data, error } = await BffApiService.media.toggleStoryLike(mediaId);
      if (error) {
        item.user_liked  = prevLiked;
        item.likes_count = prevCount;
      } else {
        item.user_liked  = Boolean(data?.user_liked ?? !prevLiked);
        item.likes_count = Math.max(0, Number(data?.likes_count ?? item.likes_count));
      }
      document.dispatchEvent(new CustomEvent('barberflow:prism-story-like-done', { bubbles: false }));
    });
  }

  static { StoryViewer.#initPrismLikeListener(); }
}
