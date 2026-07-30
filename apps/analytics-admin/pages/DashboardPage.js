'use strict';

class DashboardPage {
  #metricsService;
  #events = [];
  #sessions = [];
  #comparisonEvents = [];
  #metricGrid;
  #funnel;
  #activityRoot;
  #onlineRoot;

  constructor(root, metricsService) {
    this.#metricsService = metricsService;
    this.#metricGrid = new globalThis.MetricGrid(root.querySelector('[data-metric-grid]'));
    this.#funnel = new globalThis.FunnelView(root.querySelector('[data-dashboard-funnel]'), true);
    this.#activityRoot = root.querySelector('[data-activity-list]');
    this.#onlineRoot = root.querySelector('[data-online-count]');
  }

  setData(events, sessions, comparisonEvents = []) {
    this.#events = events;
    this.#sessions = sessions;
    this.#comparisonEvents = comparisonEvents;
    this.render();
  }

  setOnlineCount(value) {
    this.#onlineRoot.textContent = globalThis.Formatters.integer(value);
  }

  render() {
    const metrics = this.#metricsService.summarize(
      this.#events,
      this.#sessions,
      this.#comparisonEvents,
    );
    this.#metricGrid.render(metrics);
    this.#funnel.render(this.#metricsService.funnel(this.#events));
    this.setOnlineCount(metrics.visitorsOnline);
    this.#renderActivity(this.#events);
  }

  #renderActivity(events) {
    const items = [...events]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 7)
      .map((event) => {
        const item = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'activity-dot';
        dot.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        const label = document.createElement('strong');
        label.textContent = globalThis.AnalyticsEventCatalog.label(event.eventName);
        const detail = document.createElement('small');
        detail.textContent = `${event.source} · ${event.device}`;
        copy.append(label, detail);
        const time = document.createElement('time');
        time.dateTime = event.createdAt;
        time.textContent = globalThis.Formatters.time(event.createdAt);
        item.append(dot, copy, time);
        return item;
      });
    this.#activityRoot.replaceChildren(...items);
  }
}

globalThis.DashboardPage = DashboardPage;
