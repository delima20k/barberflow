'use strict';

class PortfolioViewerModal {
  #overlay = null;
  #figure = null;
  #img = null;
  #title = null;
  #actions = null;
  #count = null;
  #items = [];
  #index = 0;
  #swipeStartX = null;

  constructor() {
    this.#ensure();
  }

  open(item, items = []) {
    this.#ensure();
    if (!this.#overlay || !this.#img) return;

    this.#items = Array.isArray(items) && items.length ? items : [item];
    const index = this.#items.findIndex(foto => foto?.id && foto.id === item?.id);
    this.#index = index >= 0 ? index : 0;
    this.#renderAtual('next');

    this.#overlay.hidden = false;
    this.#overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portfolio-viewer-open');
  }

  close() {
    if (!this.#overlay) return;
    this.#overlay.hidden = true;
    this.#overlay.setAttribute('aria-hidden', 'true');
    if (this.#img) this.#img.src = '';
    document.body.classList.remove('portfolio-viewer-open');
  }

  next() {
    this.#go(1);
  }

  prev() {
    this.#go(-1);
  }

  #go(delta) {
    if (this.#items.length < 2) return;
    this.#index = (this.#index + delta + this.#items.length) % this.#items.length;
    this.#renderAtual(delta > 0 ? 'next' : 'prev');
  }

  #renderAtual(direcao) {
    const item = this.#items[this.#index] ?? {};
    this.#img.src = item.fullUrl || item.thumbUrl || '';
    this.#img.alt = item.title || 'Portfolio';

    if (this.#title) this.#title.textContent = item.title || 'Trabalho do barbeiro';
    if (this.#count) this.#count.textContent = `${this.#index + 1}/${this.#items.length}`;

    if (this.#actions) {
      this.#actions.innerHTML = '';
      if (typeof PortfolioImageActions !== 'undefined') {
        this.#actions.appendChild(PortfolioImageActions.criar(item));
      }
    }

    this.#overlay?.querySelectorAll('[data-portfolio-viewer="prev"], [data-portfolio-viewer="next"]').forEach(btn => {
      btn.hidden = this.#items.length < 2;
    });

    this.#figure?.classList.remove('portfolio-viewer__figure--next', 'portfolio-viewer__figure--prev');
    void this.#figure?.offsetWidth;
    this.#figure?.classList.add(`portfolio-viewer__figure--${direcao}`);
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
      <button type="button" class="portfolio-viewer__nav portfolio-viewer__nav--prev" data-portfolio-viewer="prev" aria-label="Foto anterior">&lsaquo;</button>
      <figure class="portfolio-viewer__figure">
        <img class="portfolio-viewer__img" alt="">
        <figcaption class="portfolio-viewer__title"></figcaption>
        <div class="portfolio-viewer__actions"></div>
      </figure>
      <button type="button" class="portfolio-viewer__nav portfolio-viewer__nav--next" data-portfolio-viewer="next" aria-label="Proxima foto">&rsaquo;</button>
      <span class="portfolio-viewer__count" aria-live="polite"></span>
    `;

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.portfolio-viewer__close')) this.close();
      if (event.target.closest('[data-portfolio-viewer="prev"]')) this.prev();
      if (event.target.closest('[data-portfolio-viewer="next"]')) this.next();
    });

    overlay.addEventListener('pointerdown', event => {
      this.#swipeStartX = event.clientX;
    });

    overlay.addEventListener('pointerup', event => {
      if (this.#swipeStartX == null) return;
      const deslocamento = event.clientX - this.#swipeStartX;
      this.#swipeStartX = null;
      if (Math.abs(deslocamento) < 48) return;
      deslocamento < 0 ? this.next() : this.prev();
    });

    document.addEventListener('keydown', event => {
      if (!overlay.hidden && event.key === 'Escape') this.close();
      if (!overlay.hidden && event.key === 'ArrowLeft') this.prev();
      if (!overlay.hidden && event.key === 'ArrowRight') this.next();
    });

    document.body.appendChild(overlay);
    this.#overlay = overlay;
    this.#figure = overlay.querySelector('.portfolio-viewer__figure');
    this.#img = overlay.querySelector('.portfolio-viewer__img');
    this.#title = overlay.querySelector('.portfolio-viewer__title');
    this.#actions = overlay.querySelector('.portfolio-viewer__actions');
    this.#count = overlay.querySelector('.portfolio-viewer__count');
  }
}
