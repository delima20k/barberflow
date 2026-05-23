import { SectionEventCatalog } from '../../../../../../../events/catalog.js';

export class AnalyticsController {
  #state;
  #view;
  #unsubscribes = [];
  constructor({ state, view } = {}) {
    if (!state?.record || !view?.render) throw new Error('AnalyticsController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
  }
  init({ on } = {}) {
    if (typeof on === 'function') {
      [
        SectionEventCatalog.AGENDA_READY,
        SectionEventCatalog.SETTINGS_CHANGED,
        SectionEventCatalog.STORY_CHANGED,
        SectionEventCatalog.PORTFOLIO_CHANGED,
        SectionEventCatalog.NOTIFICATION_CHANGED,
        SectionEventCatalog.QUEUE_CHANGED,
      ].forEach(eventName => this.#unsubscribes.push(on(eventName, payload => this.#record(eventName, payload))));
    }
    this.render();
  }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) { this.#state.merge(partial); this.render(); }
  destroy() { this.#unsubscribes.splice(0).forEach(unsubscribe => unsubscribe()); }
  #record(name, payload) { this.#state.record(name, payload); this.render(); }
}
