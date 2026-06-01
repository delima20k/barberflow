export class AnalyticsState {
  #events;
  constructor({ events = [] } = {}) { this.setEvents(events); }
  get snapshot() { return { events: [...this.#events] }; }
  setEvents(events) { this.#events = Array.isArray(events) ? [...events] : []; }
  record(name, payload) { this.#events = [...this.#events, { name, payload }]; }
  merge(partial = {}) { if ('events' in partial) this.setEvents(partial.events); }
}
