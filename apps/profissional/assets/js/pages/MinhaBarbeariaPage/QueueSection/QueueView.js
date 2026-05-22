'use strict';

class QueueView {
  #root;
  constructor(rootElement) { this.#root = rootElement; }
  render(state) {
    const region = this.#root.querySelector?.('[data-minha-barbearia-queue-section]');
    if (!region) return;
    region.dataset.queueCount = String(state.entries.length);
    region.dataset.realtimeActive = String(state.realtimeActive);
  }
}
