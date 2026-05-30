'use strict';

// =============================================================
// PortfolioPrismViewer.js — Visualizador 3D em prisma hexagonal
//
// Compartilhado entre app cliente e app profissional.
// API pública idêntica (open/close/next/prev) — drop-in replacement
// de PortfolioViewerModal.
//
// Efeito: 6 faces dispostas em prisma regular (60° entre faces),
// gira em rotateY conforme o swipe. Drag proporcional ao dedo,
// snap por distância (18%) ou velocidade (0.35 px/ms), easing
// cubic-bezier(0.22, 1, 0.36, 1) a 520ms.
//
// Suporta imagens (<img>) e vídeos (<video muted playsinline>).
// Apenas a face frontal toca vídeo automaticamente.
// =============================================================

class PortfolioPrismViewer {

  // ── Constantes geométricas/físicas ─────────────────────────
  static #SIDES                 = 6;
  static #ANGLE_PER_FACE        = 60;                  // 360 / SIDES
  static #DURATION_MS           = 520;
  static #EASING                = 'cubic-bezier(0.22, 1, 0.36, 1)';
  static #THRESHOLD_DIST_RATIO  = 0.18;
  static #VELOCITY_THRESHOLD    = 0.35;                // px/ms
  static #DRAG_MIN_PX           = 8;                   // gesto horizontal só após este deslocamento
  // Ordem visual das 6 faces ao redor do índice atual.
  // Face 0 = frontal; 1/2/3 giram à direita; -2/-1 giram à esquerda.
  static #FACE_OFFSETS          = [0, 1, 2, 3, -2, -1];

  // ── Estado ─────────────────────────────────────────────────
  #overlay         = null;
  #stage           = null;
  #cube            = null;
  #faces           = [];      // 6 figures
  #medias          = [];      // 6 .pp-prism-media (container interno de cada face)
  #meta            = null;
  #avatar          = null;
  #name            = null;
  #likes           = null;
  #title           = null;
  #actions         = null;
  #publicActions   = null;
  #publicInput     = null;
  #publicLike      = null;
  #publicEmoji     = null;
  #reactionLayer   = null;
  #count           = null;

  #items           = [];
  #index           = 0;

  #faceWidth       = 0;
  #radius          = 0;
  #baseRotation    = 0;

  #dragStart       = null;    // { x, y, t, captured }
  #dragLast        = null;    // { x, t } — para velocidade
  #dragActive      = false;
  #dragRAF         = 0;
  #pendingAngle    = 0;

  #animando        = false;
  #finalizeTimer   = null;
  #resizeObserver  = null;
  #floatTimers      = new Set();

  #onKeydown       = null;

  constructor() {
    this.#ensure();
  }

  // ───────────────────────────────────────────────────────────
  // API pública
  // ───────────────────────────────────────────────────────────

  open(item, items = []) {
    this.#ensure();
    if (!this.#overlay || !this.#cube) return;

    const lista = Array.isArray(items) && items.length ? items : (item ? [item] : []);
    this.#items = lista;

    const idx = item ? lista.findIndex(i => i?.id && i.id === item.id) : 0;
    this.#index = idx >= 0 ? idx : 0;

    this.#overlay.hidden = false;
    this.#overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portfolio-viewer-open');

    // Mede stage e calcula raio (espera 1 frame para o layout aplicar)
    requestAnimationFrame(() => {
      this.#medirStage();
      this.#renderAtual({ animar: false });
      this.#onKeydown ??= (e) => this.#handleKey(e);
      document.addEventListener('keydown', this.#onKeydown);
    });
  }

  close() {
    if (!this.#overlay) return;
    this.#overlay.hidden = true;
    this.#overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('portfolio-viewer-open');

    this.#pararTodosVideos(true);
    this.#limparTimer();
    this.#limparInteracoes();
    if (this.#publicInput) this.#publicInput.value = '';
    this.#dragStart = null;
    this.#dragLast = null;
    this.#dragActive = false;
    this.#animando = false;

    if (this.#onKeydown) {
      document.removeEventListener('keydown', this.#onKeydown);
    }
  }

  next() { this.#go(1); }
  prev() { this.#go(-1); }

  // ───────────────────────────────────────────────────────────
  // Navegação
  // ───────────────────────────────────────────────────────────

  #go(delta) {
    if (!this.#items.length || this.#animando) return;
    if (this.#items.length < 2) return; // 1 item: sem rotação
    this.#animarPara(delta);
  }

  #animarPara(delta) {
    const dir = delta > 0 ? 1 : -1;
    this.#animando = true;
    this.#cube.classList.remove('pp-prism-cube--drag');
    void this.#cube.offsetWidth; // força reflow: garante que a transição CSS está ativa antes do novo transform
    // Aplica nova rotação (gira -60° para próxima, +60° para anterior)
    const novaRotacao = this.#baseRotation - (dir * PortfolioPrismViewer.#ANGLE_PER_FACE);
    this.#cube.style.transform = `rotateY(${novaRotacao}deg)`;

    this.#limparTimer();
    this.#finalizeTimer = setTimeout(() => {
      this.#index = (this.#index + dir + this.#items.length) % this.#items.length;
      this.#animando = false;
      this.#renderAtual({ animar: false });
    }, PortfolioPrismViewer.#DURATION_MS + 30);
  }

  // ───────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────

  #renderAtual({ animar = false } = {}) {
    if (!this.#items.length) return;

    const item = this.#items[this.#index] ?? {};
    if (this.#title) this.#title.textContent = item.title || 'Trabalho do portfólio';
    if (this.#count) this.#count.textContent = `${this.#index + 1}/${this.#items.length}`;
    this.#renderMeta(item);
    this.#renderPublicActions(item);

    if (this.#actions) {
      this.#actions.innerHTML = '';
      if (!item?.portfolioPublicActions && typeof PortfolioImageActions !== 'undefined') {
        try { this.#actions.appendChild(PortfolioImageActions.criar(item)); } catch (_) {}
      }
    }

    // Reset visual do cubo (volta para rotação base zero, sem animação)
    this.#baseRotation = 0;
    this.#cube.classList.remove('pp-prism-cube--drag');
    if (!animar) {
      const prevTransition = this.#cube.style.transition;
      this.#cube.style.transition = 'none';
      this.#cube.style.transform = `rotateY(0deg)`;
      // força reflow e restaura
      void this.#cube.offsetWidth;
      this.#cube.style.transition = prevTransition || '';
    }

    this.#renderFaces();
  }

  #renderPublicActions(item) {
    if (!this.#publicActions) return;

    const visivel = Boolean(item?.portfolioPublicActions);
    const imageId = item?.id ?? '';
    const imageAnterior = this.#publicActions.dataset.portfolioImageId ?? '';
    this.#publicActions.hidden = !visivel;
    this.#publicActions.dataset.portfolioImageId = imageId;
    this.#publicActions.dataset.professionalId = item?.professionalId ?? '';

    if (!visivel) {
      if (this.#publicInput) this.#publicInput.value = '';
      return;
    }

    const likesCount = Math.max(0, Number(item?.likesCount ?? item?.likes_count ?? 0));
    if (this.#publicLike) {
      this.#publicLike.classList.toggle('is-liked', Boolean(item?.liked));
      this.#publicLike.disabled = false;
      this.#publicLike.setAttribute('aria-pressed', item?.liked ? 'true' : 'false');
      const count = this.#publicLike.querySelector('[data-public-like-count]');
      if (count) count.textContent = String(likesCount);
    }
    if (this.#publicInput) {
      if (imageAnterior !== imageId) this.#publicInput.value = '';
      this.#publicInput.disabled = false;
    }
    if (this.#publicEmoji) this.#publicEmoji.disabled = false;
  }

  #renderMeta(item) {
    if (!this.#meta) return;

    const nome = item?.professionalName || item?.barberName || item?.authorName || '';
    const avatarUrl = item?.professionalAvatarUrl || item?.barberAvatarUrl || item?.authorAvatarUrl || '';
    const likesCount = Math.max(0, Number(item?.likesCount ?? item?.likes_count ?? 0));

    this.#meta.hidden = !nome && !avatarUrl && !likesCount;
    this.#meta.dataset.portfolioImageId = item?.id ?? '';
    if (this.#name) this.#name.textContent = nome || 'Barbeiro';
    if (this.#likes) this.#likes.textContent = `${likesCount} curtida${likesCount === 1 ? '' : 's'}`;
    if (!this.#avatar) return;

    if (avatarUrl) {
      this.#avatar.hidden = false;
      this.#avatar.src = avatarUrl;
      this.#avatar.alt = nome ? `Avatar de ${nome}` : '';
    } else {
      this.#avatar.hidden = true;
      this.#avatar.removeAttribute('src');
      this.#avatar.alt = '';
    }
  }

  #renderFaces() {
    const total = this.#items.length;
    PortfolioPrismViewer.#FACE_OFFSETS.forEach((offset, faceIndex) => {
      const idx = ((this.#index + offset) % total + total) % total;
      const item = this.#items[idx] ?? null;
      this.#renderMidiaNaFace(faceIndex, item, offset === 0);
    });

    // Garante play só na frontal
    this.#pararTodosVideos(false);
    this.#playVideoFrontal();
  }

  #renderMidiaNaFace(faceIndex, item, frontal) {
    const slot = this.#medias[faceIndex];
    if (!slot) return;

    const url   = item?.fullUrl || item?.thumbUrl || '';
    const poster = item?.thumbUrl || '';
    const isVideo = PortfolioPrismViewer.#detectarVideo(item);

    // Decide se reusa elemento existente ou recria
    const tagAtual = slot.firstElementChild?.tagName;
    const tagNova  = isVideo ? 'VIDEO' : 'IMG';

    if (tagAtual !== tagNova) {
      slot.innerHTML = '';
      const el = document.createElement(isVideo ? 'video' : 'img');
      if (isVideo) {
        el.muted       = true;
        el.playsInline = true;
        el.preload     = 'metadata';
        el.loop        = true;
      } else {
        el.alt     = item?.title || '';
        el.onerror = () => { el.style.opacity = '0'; };
      }
      slot.appendChild(el);
    }

    const el = slot.firstElementChild;
    if (isVideo) {
      if (poster) el.poster = poster;
      if (el.src !== url) el.src = url;
      // Apenas a face frontal pode dar play; demais ficam pausadas
      if (!frontal) el.pause();
    } else {
      if (el.src !== url && url) el.src = url;
      el.alt = item?.title || '';
    }
  }

  static #detectarVideo(item) {
    if (!item) return false;
    if (typeof item.type === 'string' && item.type.startsWith('video')) return true;
    if (item.mediaType && /video/i.test(item.mediaType)) return true;
    const url = item.fullUrl || '';
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  }

  #pararTodosVideos(limparSrc = false) {
    this.#medias.forEach(slot => {
      const v = slot?.querySelector('video');
      if (!v) return;
      try { v.pause(); } catch (_) {}
      if (limparSrc) { try { v.removeAttribute('src'); v.load?.(); } catch (_) {} }
    });
  }

  #playVideoFrontal() {
    const frontalIndex = PortfolioPrismViewer.#FACE_OFFSETS.indexOf(0);
    const slot = this.#medias[frontalIndex];
    const v = slot?.querySelector('video');
    if (!v) return;
    // Tentativa silenciosa de autoplay (muted + playsinline normalmente passa)
    v.play?.().catch(() => {});
  }

  // ───────────────────────────────────────────────────────────
  // Medição e raio (responsivo)
  // ───────────────────────────────────────────────────────────

  #medirStage() {
    if (!this.#stage) return;
    const w = this.#stage.clientWidth || 320;
    this.#faceWidth = w;
    this.#radius    = (w / 2) / Math.tan(Math.PI / PortfolioPrismViewer.#SIDES); // ≈ w * 0.866
    this.#stage.style.setProperty('--pp-radius', `${this.#radius}px`);
    this.#aplicarTransformsDasFaces();
  }

  #aplicarTransformsDasFaces() {
    this.#faces.forEach((face, i) => {
      face.style.transform = `rotateY(${i * PortfolioPrismViewer.#ANGLE_PER_FACE}deg) translateZ(${this.#radius}px)`;
    });
  }

  // ───────────────────────────────────────────────────────────
  // Drag / swipe (Pointer Events)
  // ───────────────────────────────────────────────────────────

  #onPointerDown(e) {
    if (this.#animando) return;
    if (e.target.closest('.pp-prism-close, .pp-prism-actions')) return;
    if (this.#items.length < 2) return;

    this.#dragStart = { x: e.clientX, y: e.clientY, t: performance.now(), captured: false };
    this.#dragLast  = { x: e.clientX, t: this.#dragStart.t };
    this.#dragActive = false;
    this.#pendingAngle = 0;
    try { this.#stage.setPointerCapture?.(e.pointerId); } catch (_) {}
  }

  #onPointerMove(e) {
    if (!this.#dragStart || this.#animando) return;
    const dx = e.clientX - this.#dragStart.x;
    const dy = e.clientY - this.#dragStart.y;

    if (!this.#dragActive) {
      if (Math.abs(dx) < PortfolioPrismViewer.#DRAG_MIN_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return; // gesto vertical: deixa scroll
      this.#dragActive = true;
      this.#cube.classList.add('pp-prism-cube--drag');
    }

    const angulo = (dx / Math.max(this.#faceWidth, 1)) * PortfolioPrismViewer.#ANGLE_PER_FACE;
    this.#pendingAngle = angulo;
    this.#dragLast = { x: e.clientX, t: performance.now() };

    if (!this.#dragRAF) {
      this.#dragRAF = requestAnimationFrame(() => {
        this.#dragRAF = 0;
        if (!this.#dragActive) return;
        this.#cube.style.transform = `rotateY(${this.#baseRotation + this.#pendingAngle}deg)`;
      });
    }
  }

  #onPointerUp(e) {
    if (!this.#dragStart) return;
    const inicio = this.#dragStart;
    this.#dragStart = null;

    if (this.#dragRAF) { cancelAnimationFrame(this.#dragRAF); this.#dragRAF = 0; }

    if (!this.#dragActive) {
      // não chegou a virar arrasto — nada a fazer
      return;
    }
    this.#dragActive = false;

    const dx = e.clientX - inicio.x;
    const dt = Math.max(1, performance.now() - (this.#dragLast?.t ?? inicio.t) + 1);
    // Velocidade média da última amostra
    const dxRecente = (e.clientX - (this.#dragLast?.x ?? inicio.x));
    const velocity = dxRecente / dt;

    const threshold = this.#faceWidth * PortfolioPrismViewer.#THRESHOLD_DIST_RATIO;

    let acao = 'snap';
    if (dx <= -threshold || velocity <= -PortfolioPrismViewer.#VELOCITY_THRESHOLD) acao = 'next';
    else if (dx >= threshold || velocity >= PortfolioPrismViewer.#VELOCITY_THRESHOLD) acao = 'prev';

    this.#cube.classList.remove('pp-prism-cube--drag');

    if (acao === 'next')      this.#animarPara(1);
    else if (acao === 'prev') this.#animarPara(-1);
    else this.#snapBack();
  }

  #onPointerCancel() {
    if (this.#dragRAF) { cancelAnimationFrame(this.#dragRAF); this.#dragRAF = 0; }
    this.#dragStart = null;
    if (this.#dragActive) {
      this.#dragActive = false;
      this.#cube.classList.remove('pp-prism-cube--drag');
      this.#snapBack();
    }
  }

  #snapBack() {
    if (!this.#cube) return;
    this.#cube.style.transform = `rotateY(${this.#baseRotation}deg)`;
  }

  // ───────────────────────────────────────────────────────────
  // Teclado
  // ───────────────────────────────────────────────────────────

  #handleKey(e) {
    if (this.#overlay?.hidden) return;
    if (e.key === 'Escape')      { e.preventDefault(); this.close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); this.prev(); }
  }

  // ───────────────────────────────────────────────────────────
  // Utilitários
  // ───────────────────────────────────────────────────────────

  #limparTimer() {
    if (this.#finalizeTimer) { clearTimeout(this.#finalizeTimer); this.#finalizeTimer = null; }
  }

  #itemAtual() {
    return this.#items[this.#index] ?? {};
  }

  async #handlePublicLike() {
    const item = this.#itemAtual();
    if (!item?.portfolioPublicActions || !item?.id || !this.#publicLike) return;
    if (typeof BffApiService === 'undefined') return;

    const likedAntes = Boolean(item.liked);
    const countAntes = Math.max(0, Number(item.likesCount ?? item.likes_count ?? 0));
    const countNovo = Math.max(0, countAntes + (likedAntes ? -1 : 1));

    item.liked = !likedAntes;
    item.likesCount = countNovo;
    this.#renderMeta(item);
    this.#renderPublicActions(item);
    this.#publicLike.disabled = true;

    try {
      const { data, error } = likedAntes
        ? await BffApiService.profissionais.descurtirPortfolioImagem(item.id)
        : await BffApiService.profissionais.curtirPortfolioImagem(item.id);
      if (error) throw error;
      item.liked = Boolean(data?.liked);
      item.likesCount = Math.max(0, Number(data?.likesCount ?? countNovo));
      this.#renderMeta(item);
      this.#renderPublicActions(item);
      if (!likedAntes) this.#emitInteraction('Curtida');
    } catch {
      item.liked = likedAntes;
      item.likesCount = countAntes;
      this.#renderMeta(item);
      this.#renderPublicActions(item);
    } finally {
      if (this.#publicLike) this.#publicLike.disabled = false;
    }
  }

  async #handlePublicMessage(body) {
    const item = this.#itemAtual();
    const texto = String(body ?? '').trim();
    if (!item?.portfolioPublicActions || !item?.professionalId || !texto) return;
    if (typeof BffApiService === 'undefined') return;

    const payload = {
      body: texto,
      portfolioImageId: item.id,
      clientMessageId: PortfolioPrismViewer.#clientMessageId(),
    };

    if (this.#publicInput) this.#publicInput.disabled = true;
    if (this.#publicEmoji) this.#publicEmoji.disabled = true;
    try {
      const { error } = await BffApiService.profissionais.iniciarMensagemBarbearia(item.professionalId, payload);
      if (error) throw error;
      if (this.#publicInput && texto !== PortfolioPrismViewer.#laughEmoji()) this.#publicInput.value = '';
      this.#emitInteraction(texto);
    } catch {
      // Erro silencioso mantem o viewer estavel; BffApiService ja devolve erro estruturado.
    } finally {
      if (this.#publicInput) this.#publicInput.disabled = false;
      if (this.#publicEmoji) this.#publicEmoji.disabled = false;
    }
  }

  #emitInteraction(texto) {
    if (!this.#reactionLayer) return;
    const el = document.createElement('span');
    el.className = 'pp-prism-float';
    el.textContent = String(texto ?? '').slice(0, 80);
    this.#reactionLayer.appendChild(el);
    const remover = () => {
      el.remove();
      if (timer) this.#floatTimers.delete(timer);
    };
    el.addEventListener('animationend', remover, { once: true });
    const timer = setTimeout(remover, 1800);
    this.#floatTimers.add(timer);
  }

  #limparInteracoes() {
    this.#reactionLayer?.replaceChildren();
    this.#floatTimers.forEach(timer => clearTimeout(timer));
    this.#floatTimers.clear();
  }

  static #clientMessageId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  static #laughEmoji() {
    return '\u{1F602}';
  }

  // ───────────────────────────────────────────────────────────
  // Bootstrap DOM
  // ───────────────────────────────────────────────────────────

  #ensure() {
    if (this.#overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'pp-prism-viewer';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');

    const facesHtml = Array.from({ length: PortfolioPrismViewer.#SIDES }, (_, i) =>
      `<figure class="pp-prism-face" data-face="${i}"><div class="pp-prism-media"></div></figure>`
    ).join('');

    overlay.innerHTML = `
      <button type="button" class="pp-prism-close" aria-label="Fechar">×</button>
      <div class="pp-prism-meta" hidden>
        <img class="pp-prism-avatar" alt="" loading="lazy">
        <span class="pp-prism-meta-text">
          <strong class="pp-prism-name"></strong>
          <span class="pp-prism-likes" data-portfolio-meta-count></span>
        </span>
      </div>
      <div class="pp-prism-stage" aria-live="polite">
        <div class="pp-prism-cube">${facesHtml}</div>
        <div class="pp-prism-reactions" aria-hidden="true"></div>
      </div>
      <div class="pp-prism-public-actions" hidden>
        <img class="pp-prism-public-logo" src="/shared/img/Logo01.png" alt="BarberFlow" loading="lazy">
        <input class="pp-prism-message-input" type="text" maxlength="240" placeholder="Mensagem" aria-label="Mensagem">
        <button type="button" class="pp-prism-public-like" aria-label="Curtir portfolio" aria-pressed="false">
          <span aria-hidden="true">&hearts;</span>
          <span data-public-like-count>0</span>
        </button>
        <button type="button" class="pp-prism-public-emoji" aria-label="Enviar risada">${PortfolioPrismViewer.#laughEmoji()}</button>
      </div>
      <figcaption class="pp-prism-title"></figcaption>
      <div class="pp-prism-actions"></div>
      <span class="pp-prism-count" aria-live="polite"></span>
    `;

    document.body.appendChild(overlay);

    this.#overlay = overlay;
    this.#stage   = overlay.querySelector('.pp-prism-stage');
    this.#cube    = overlay.querySelector('.pp-prism-cube');
    this.#faces   = [...overlay.querySelectorAll('.pp-prism-face')];
    this.#medias  = this.#faces.map(f => f.querySelector('.pp-prism-media'));
    this.#meta    = overlay.querySelector('.pp-prism-meta');
    this.#avatar  = overlay.querySelector('.pp-prism-avatar');
    this.#name    = overlay.querySelector('.pp-prism-name');
    this.#likes   = overlay.querySelector('.pp-prism-likes');
    this.#title   = overlay.querySelector('.pp-prism-title');
    this.#actions = overlay.querySelector('.pp-prism-actions');
    this.#publicActions = overlay.querySelector('.pp-prism-public-actions');
    this.#publicInput = overlay.querySelector('.pp-prism-message-input');
    this.#publicLike = overlay.querySelector('.pp-prism-public-like');
    this.#publicEmoji = overlay.querySelector('.pp-prism-public-emoji');
    this.#reactionLayer = overlay.querySelector('.pp-prism-reactions');
    this.#count   = overlay.querySelector('.pp-prism-count');

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.pp-prism-close')) this.close();
    });

    this.#stage?.addEventListener('pointerdown',   e => this.#onPointerDown(e));
    this.#stage?.addEventListener('pointermove',   e => this.#onPointerMove(e));
    this.#stage?.addEventListener('pointerup',     e => this.#onPointerUp(e));
    this.#stage?.addEventListener('pointercancel', () => this.#onPointerCancel());
    this.#stage?.addEventListener('lostpointercapture', () => this.#onPointerCancel());

    this.#publicActions?.addEventListener('click', e => {
      const likeBtn = e.target.closest('.pp-prism-public-like');
      if (likeBtn) {
        e.preventDefault();
        this.#handlePublicLike();
        return;
      }
      const emojiBtn = e.target.closest('.pp-prism-public-emoji');
      if (emojiBtn) {
        e.preventDefault();
        this.#handlePublicMessage(PortfolioPrismViewer.#laughEmoji());
      }
    });

    this.#publicInput?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.#handlePublicMessage(this.#publicInput.value);
    });

    // ResizeObserver — recalcula raio quando o stage mudar de tamanho
    if (typeof ResizeObserver !== 'undefined' && this.#stage) {
      this.#resizeObserver = new ResizeObserver(() => {
        if (this.#overlay?.hidden) return;
        this.#medirStage();
      });
      this.#resizeObserver.observe(this.#stage);
    }
  }
}
