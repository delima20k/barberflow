'use strict';

class FunnelPage {
  #view;
  #metrics;
  #events = [];

  constructor(root, metricsService) {
    this.#metrics = metricsService;
    this.#view = new globalThis.FunnelView(root.querySelector('[data-funnel-view]'));
  }

  setData(events) {
    this.#events = events;
    this.render();
  }

  render() {
    this.#view.render(this.#metrics.funnel(this.#events));
  }
}

globalThis.FunnelPage = FunnelPage;
