export class PortfolioView {
  #root;
  constructor(rootElement) { this.#root = rootElement; }
  render(state) {
    const region = this.#root.querySelector?.('[data-minha-barbearia-portfolio-section]');
    if (!region) return;
    region.dataset.portfolioCount = String(state.items.length);
  }
}
