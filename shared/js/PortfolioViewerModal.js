'use strict';

class PortfolioViewerModal {
  #overlay = null;
  #img = null;
  #title = null;

  constructor() {
    this.#ensure();
  }

  open(item) {
    this.#ensure();
    if (!this.#overlay || !this.#img) return;
    this.#img.src = item.fullUrl || item.thumbUrl || '';
    this.#img.alt = item.title || 'Portfolio';
    if (this.#title) this.#title.textContent = item.title || 'Trabalho do barbeiro';
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

  #ensure() {
    if (this.#overlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'portfolio-viewer';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <button type="button" class="portfolio-viewer__close" aria-label="Fechar">×</button>
      <figure class="portfolio-viewer__figure">
        <img class="portfolio-viewer__img" alt="">
        <figcaption class="portfolio-viewer__title"></figcaption>
      </figure>
    `;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.portfolio-viewer__close')) this.close();
    });
    document.addEventListener('keydown', event => {
      if (!overlay.hidden && event.key === 'Escape') this.close();
    });
    document.body.appendChild(overlay);
    this.#overlay = overlay;
    this.#img = overlay.querySelector('.portfolio-viewer__img');
    this.#title = overlay.querySelector('.portfolio-viewer__title');
  }
}
