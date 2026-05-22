'use strict';

class NotificationController {
  #state;
  #view;
  #queueRealtimeClient;
  #emit = null;
  #unsubscribes = [];

  constructor({ state, view, queueRealtimeClient = null } = {}) {
    if (!state?.merge || !view?.render) throw new Error('NotificationController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
    this.#queueRealtimeClient = queueRealtimeClient;
  }
  init({ emit, on } = {}) {
    this.#emit = emit;
    if (typeof on === 'function') {
      this.#unsubscribes.push(on(SectionEventCatalog.SETTINGS_CHANGED, this.#settingsChanged.bind(this)));
      this.#unsubscribes.push(on(SectionEventCatalog.QUEUE_REALTIME_CHANGED, this.#queueRealtimeChanged.bind(this)));
    }
    this.render();
  }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    this.#state.merge(partial);
    this.render();
    this.#emit?.(SectionEventCatalog.NOTIFICATION_CHANGED, this.#state.snapshot);
  }
  destroy() { this.#unsubscribes.splice(0).forEach(unsubscribe => unsubscribe()); this.#emit = null; }
  #settingsChanged(payload = {}) { this.update({ settingsRevision: payload.changedAt ?? null }); }
  #queueRealtimeChanged(payload = {}) { this.update({ realtimeActive: payload.active ?? this.#queueRealtimeClient?.active ?? false }); }
}
