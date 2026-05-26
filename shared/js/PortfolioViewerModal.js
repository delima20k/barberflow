'use strict';

class PortfolioViewerModal {
  #overlay = null;
  #cube = null;
  #faces = [];
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
    this.#resetarCubo();
    this.#renderAtual();
  }

  #renderAtual() {
    const item = this.#items[this.#index] ?? {};

    if (this.#title) this.#title.textContent = item.title || 'Trabalho do barbeiro';
    if (this.#count) this.#count.textContent = `${this.#index + 1}/${this.#items.length}`;

    if (this.#actions) {
      this.#actions.innerHTML = '';
      if (typeof PortfolioImageActions !== 'undefined') {
        this.#actions.appendChild(PortfolioImageActions.criar(item));
      }
    }

    this.#renderFaces();
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
      <div class="portfolio-viewer__stage" aria-live="polite">
        <div class="portfolio-viewer__cube">
          <figure class="portfolio-viewer__face portfolio-viewer__face--front"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--right"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--back"><img class="portfolio-viewer__img" alt=""></figure>
          <figure class="portfolio-viewer__face portfolio-viewer__face--left"><img class="portfolio-viewer__img" alt=""></figure>
        </div>
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
    this.#title = overlay.querySelector('.portfolio-viewer__title');
    this.#actions = overlay.querySelector('.portfolio-viewer__actions');
    this.#count = overlay.querySelector('.portfolio-viewer__count');
  }
}
