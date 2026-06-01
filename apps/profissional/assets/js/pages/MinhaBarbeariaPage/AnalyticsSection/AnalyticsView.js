export class AnalyticsView {
  #root;
  constructor(rootElement) { this.#root = rootElement; }
  render(state) {
    const region = this.#root.querySelector?.('[data-minha-barbearia-analytics-section]');
    if (region) region.dataset.analyticsEvents = String(state.events.length);
  }
}
