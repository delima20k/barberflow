'use strict';

class PortfolioState {
  #items;
  #mediaDependency;

  constructor({ items = [], mediaDependency = 'MediaManager' } = {}) {
    this.setItems(items);
    this.setMediaDependency(mediaDependency);
  }
  get snapshot() { return { items: [...this.#items], mediaDependency: this.#mediaDependency }; }
  setItems(items) { this.#items = Array.isArray(items) ? [...items] : []; }
  setMediaDependency(value) { this.#mediaDependency = typeof value === 'string' ? value : 'MediaManager'; }
  merge(partial = {}) {
    if ('items' in partial) this.setItems(partial.items);
    if ('mediaDependency' in partial) this.setMediaDependency(partial.mediaDependency);
  }
}
