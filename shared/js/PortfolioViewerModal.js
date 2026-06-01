'use strict';

class PortfolioViewerModal {
  #overlay = null;
  #cube = null;
  #faces = [];
  #meta = null;
  #avatar = null;
  #name = null;
  #likes = null;
  #reactionLayer = null;
  #floatTimers = new Set();
  #title = null;
  #actions = null;
  #count = null;
  #items = [];
  #index = 0;
  #swipeStart = null;
  #trocaPendente = 0;
  #animando = false;
  #finalizeTimer = null;

  constructor() {
    this.#ensure();
  }

  open(item, items = []) {
    this.#ensure();
    if (!this.#overlay || !this.#cube) return;

    this.#items = Array.isArray(items) && items.length ? items : [item];
    const index = this.#items.findIndex(foto => foto?.id && foto.id === item?.id);
    this.#index = index >= 0 ? index : 0;
    this.#resetarCubo();
    this.#renderAtual();

    this.#overlay.hidden = false;
    this.#overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portfolio-viewer-open');
  }

  close() {
    if (!this.#overlay) return;
    this.#overlay.hidden = true;
    this.#overlay.setAttribute('aria-hidden', 'true');
    this.#limparInteracoes();
    this.#faces.forEach(face => {
      const img = face.querySelector('img');
      if (img) img.src = '';
    });
    this.#limparTimer();
    this.#resetarCubo();
    document.body.classList.remove('portfolio-viewer-open');
  }

  next() {
    this.#go(1);
  }

  prev() {
    this.#go(-1);
  }

  #go(delta) {
    if (this.#items.length < 2 || this.#animando) return;
    this.#prepararTroca(delta);
  }

  #prepararTroca(delta) {
    if (!this.#cube) return;
    this.#trocaPendente = delta > 0 ? 1 : -1;
    this.#animando = true;
    this.#cube.classList.remove('portfolio-viewer__cube--drag', 'portfolio-viewer__cube--next', 'portfolio-viewer__cube--prev');
    void this.#cube.offsetWidth;
    this.#cube.classList.add(this.#trocaPendente > 0 ? 'portfolio-viewer__cube--next' : 'portfolio-viewer__cube--prev');
    this.#finalizeTimer = setTimeout(() => this.#finalizarTroca(), 720);
  }

  #finalizarTroca() {
    if (!this.#trocaPendente) return;
    this.#limparTimer();
    this.#index = (this.#index + this.#trocaPendente + this.#items.length) % this.#items.length;
    this.#trocaPendente = 0;
    this.#animando = false;
    // Suprime a transição no reset para evitar snap-back reverso (ex: -90°→0°)
    if (this.#cube) this.#cube.style.transition = 'none';
    this.#resetarCubo();
    // Restaura a transição após 2 frames (mantém o smooth snap-back do drag)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.#cube) this.#cube.style.transition = '';
    }));
    this.#renderAtual();
  }

  #renderAtual() {
    const item = this.#items[this.#index] ?? {};

    if (this.#title) this.#title.textContent = item.title || 'Trabalho do barbeiro';
    if (this.#count) this.#count.textContent = `${this.#index + 1}/${this.#items.length}`;
    this.#renderMeta(item);

    if (this.#actions) {
      this.#actions.innerHTML = '';
      if (typeof PortfolioImageActions !== 'undefined') {
        this.#actions.appendChild(PortfolioImageActions.criar(item));
      }
    }

    this.#renderFaces();
    this.#replayInteractions(item);
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
    if (!this.#faces.length) return;
    const offsets = [0, 1, 2, -1];
    this.#faces.forEach((face, faceIndex) => {
      const item = this.#itemAt(offsets[faceIndex]);
      const img = face.querySelector('img');
      if (!img) return;
      img.src = item?.fullUrl || item?.thumbUrl || '';
      img.alt = item?.title || 'Portfolio';
    });
  }

  #replayInteractions(item) {
    this.#limparInteracoes();
    const interactions = PortfolioViewerModal.#normalizarInteracoes(item);
    interactions.forEach((interaction, index) => {
      const timer = setTimeout(() => {
        this.#floatTimers.delete(timer);
        this.#emitInteraction(interaction);
      }, Math.min(index * 220, 4800));
      this.#floatTimers.add(timer);
    });
  }

  #emitInteraction({ texto, sender, type = 'message' } = {}) {
    if (!this.#reactionLayer) return;
    const tipo = ['emoji', 'like'].includes(type) ? type : 'message';
    const textoSeg = String(texto ?? '').slice(0, 80);
    const nome = String(sender?.nome ?? '').trim().slice(0, 30);
    const avatarUrl = sender?.avatarUrl ?? null;

    const el = document.createElement('div');
    el.className = PortfolioViewerModal.#floatClass(tipo);

    if (tipo === 'message' && (avatarUrl || nome)) {
      const avatar = document.createElement('img');
      avatar.className = 'pp-prism-float__avatar';
      avatar.alt = nome || '';
      avatar.loading = 'lazy';
      if (avatarUrl) avatar.src = avatarUrl;
      else avatar.hidden = true;
      avatar.onerror = () => { avatar.hidden = true; };

      const info = document.createElement('span');
      info.className = 'pp-prism-float__info';
      if (nome) {
        const nomeEl = document.createElement('strong');
        nomeEl.className = 'pp-prism-float__nome';
        nomeEl.textContent = nome;
        info.appendChild(nomeEl);
      }
      const bodyEl = document.createElement('span');
      bodyEl.className = 'pp-prism-float__texto';
      bodyEl.textContent = textoSeg;
      info.appendChild(bodyEl);
      el.append(avatar, info);
    } else {
      el.textContent = textoSeg;
    }

    this.#reactionLayer.appendChild(el);
    const remover = () => {
      el.remove();
      if (timer) this.#floatTimers.delete(timer);
    };
    el.addEventListener('animationend', remover, { once: true });
    const timer = setTimeout(remover, 4200);
    this.#floatTimers.add(timer);
  }

  static #floatClass(type) {
    if (type === 'emoji') return 'pp-prism-float pp-prism-float--emoji';
    if (type === 'like') return 'pp-prism-float pp-prism-float--like';
    return 'pp-prism-float pp-prism-float--message';
  }

  static #normalizarInteracoes(item) {
    const base = Array.isArray(item?.interactions) ? item.interactions : [];
    const normalizadas = [];
    for (const interaction of base) {
      const type = PortfolioViewerModal.#normalizarTipo(interaction?.type, interaction?.body);
      const count = Math.max(1, Number(interaction?.count ?? 1));
      const texto = String(interaction?.body ?? (type === 'like' ? '👍' : '')).trim();
      if (!texto) continue;
      if (type === 'like') {
        const total = Math.min(count, 24);
        for (let i = 0; i < total; i += 1) normalizadas.push({ type: 'like', texto: '👍' });
        continue;
      }
      normalizadas.push({ type, texto, sender: interaction?.sender ?? null });
    }

    const likesCount = Math.max(0, Number(item?.likesCount ?? item?.likes_count ?? 0));
    const temLike = base.some(interaction => interaction?.type === 'like');
    if (likesCount > 0 && !temLike) {
      const total = Math.min(likesCount, 24);
      for (let i = 0; i < total; i += 1) normalizadas.push({ type: 'like', texto: '👍' });
    }
    return normalizadas;
  }

  static #normalizarTipo(type, body) {
    if (type === 'like') return 'like';
    if (type === 'emoji' || PortfolioViewerModal.#isEmojiText(body)) return 'emoji';
    return 'message';
  }

  static #isEmojiText(value) {
    const texto = String(value ?? '').trim();
    return Boolean(texto) && texto.length <= 12 && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(texto);
  }

  #limparInteracoes() {
    this.#reactionLayer?.replaceChildren();
    this.#floatTimers.forEach(timer => clearTimeout(timer));
    this.#floatTimers.clear();
  }

  #itemAt(offset) {
    if (!this.#items.length) return null;
    const index = (this.#index + offset + this.#items.length) % this.#items.length;
    return this.#items[index] ?? null;
  }

  #aplicarAnguloDrag(event) {
    if (!this.#cube || !this.#swipeStart || this.#animando) return;
    const deslocamentoX = event.clientX - this.#swipeStart.x;
    const largura = Math.max(this.#overlay?.clientWidth ?? 1, 1);
    const angulo = Math.max(-82, Math.min(82, (deslocamentoX / largura) * 132));
    this.#cube.classList.add('portfolio-viewer__cube--drag');
    this.#cube.style.setProperty('--portfolio-spin-angle', `${angulo}deg`);
  }

  #resetarCubo() {
    if (!this.#cube) return;
    this.#cube.classList.remove('portfolio-viewer__cube--drag', 'portfolio-viewer__cube--next', 'portfolio-viewer__cube--prev');
    this.#cube.style.setProperty('--portfolio-spin-angle', '0deg');
  }

  #limparTimer() {
    if (!this.#finalizeTimer) return;
    clearTimeout(this.#finalizeTimer);
    this.#finalizeTimer = null;
  }

  #ensure() {
    if (this.#overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'portfolio-viewer';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <button type="button" class="portfolio-viewer__close" aria-label="Fechar">x</button>
      <div class="portfolio-viewer__meta" hidden>
        <img class="portfolio-viewer__avatar" alt="" loading="lazy">
        <span class="portfolio-viewer__meta-text">
          <strong class="portfolio-viewer__name"></strong>
          <span class="portfolio-viewer__likes" data-portfolio-meta-count></span>
        </span>
      </div>
      <div class="portfolio-viewer__stage" aria-live="polite">
        <div class="portfolio-viewer__cube">
          <figure class="portfolio-viewer__face portfolio-viewer__face--front"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--right"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--back"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--left"><img class="portfolio-viewer__img" alt=""></figure>
        </div>
        <div class="portfolio-viewer__reactions" aria-hidden="true"></div>
      </div>
      <figcaption class="portfolio-viewer__title"></figcaption>
      <div class="portfolio-viewer__actions"></div>
      <span class="portfolio-viewer__count" aria-live="polite"></span>
    `;

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.portfolio-viewer__close')) this.close();
    });

    overlay.addEventListener('pointerdown', event => {
      if (this.#animando || event.target.closest('.portfolio-viewer__actions, .portfolio-viewer__close')) return;
      this.#swipeStart = { x: event.clientX, y: event.clientY };
      overlay.setPointerCapture?.(event.pointerId);
    });

    overlay.addEventListener('pointermove', event => {
      this.#aplicarAnguloDrag(event);
    });

    overlay.addEventListener('pointerup', event => {
      if (!this.#swipeStart) return;
      const deslocamentoX = event.clientX - this.#swipeStart.x;
      const deslocamentoY = event.clientY - this.#swipeStart.y;
      this.#swipeStart = null;
      if (Math.abs(deslocamentoX) < 48 || Math.abs(deslocamentoX) < Math.abs(deslocamentoY)) {
        this.#resetarCubo();
        return;
      }
      this.#prepararTroca(deslocamentoX < 0 ? 1 : -1);
    });

    overlay.addEventListener('pointercancel', () => {
      this.#swipeStart = null;
      if (!this.#animando) this.#resetarCubo();
    });

    overlay.addEventListener('animationend', event => {
      if (event.target === this.#cube) this.#finalizarTroca();
    });

    document.addEventListener('keydown', event => {
      if (!overlay.hidden && event.key === 'Escape') this.close();
    });

    document.body.appendChild(overlay);
    this.#overlay = overlay;
    this.#cube = overlay.querySelector('.portfolio-viewer__cube');
    this.#faces = [...overlay.querySelectorAll('.portfolio-viewer__face')];
    this.#meta = overlay.querySelector('.portfolio-viewer__meta');
    this.#avatar = overlay.querySelector('.portfolio-viewer__avatar');
    this.#name = overlay.querySelector('.portfolio-viewer__name');
    this.#likes = overlay.querySelector('.portfolio-viewer__likes');
    this.#reactionLayer = overlay.querySelector('.portfolio-viewer__reactions');
    this.#title = overlay.querySelector('.portfolio-viewer__title');
    this.#actions = overlay.querySelector('.portfolio-viewer__actions');
    this.#count = overlay.querySelector('.portfolio-viewer__count');
  }
}
