'use strict';

class PortfolioCard {
  #item;
  #viewer;
  #items;

  constructor(item, viewer, items = []) {
    this.#item = item;
    this.#viewer = viewer;
    this.#items = items;
  }

  render() {
    const card = document.createElement('article');
    card.className = 'port-item portfolio-card parcerias-foto-item';
    card.dataset.portfolioImageId = this.#item.id ?? '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portfolio-card__media';
    btn.setAttribute('aria-label', this.#item.title || 'Abrir trabalho do barbeiro');

    const img = document.createElement('img');
    img.src = this.#item.thumbUrl || this.#item.fullUrl || '';
    img.alt = this.#item.title || 'Trabalho do barbeiro';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'portfolio-card__img';
    img.addEventListener('load', () => btn.classList.add('portfolio-card--loaded'), { once: true });
    img.addEventListener('error', () => {
      btn.classList.add('portfolio-card--erro');
      img.remove();
      btn.textContent = 'Imagem indisponivel';
    }, { once: true });

    btn.appendChild(img);
    btn.addEventListener('click', () => this.#viewer?.open(this.#item, this.#items));
    card.appendChild(btn);
    if (typeof PortfolioImageActions !== 'undefined') {
      card.appendChild(PortfolioImageActions.criar(this.#item));
    }
    return card;
  }
}
