'use strict';

class NotificationState {
  #pending;
  #settingsRevision;
  #realtimeActive;

  constructor({ pending = [], settingsRevision = null, realtimeActive = false } = {}) {
    this.setPending(pending);
    this.setSettingsRevision(settingsRevision);
    this.setRealtimeActive(realtimeActive);
  }
  get snapshot() { return { pending: [...this.#pending], settingsRevision: this.#settingsRevision, realtimeActive: this.#realtimeActive }; }
  setPending(pending) { this.#pending = Array.isArray(pending) ? [...pending] : []; }
  setSettingsRevision(revision) { this.#settingsRevision = typeof revision === 'string' ? revision : null; }
  setRealtimeActive(active) { this.#realtimeActive = active === true; }
  merge(partial = {}) {
    if ('pending' in partial) this.setPending(partial.pending);
    if ('settingsRevision' in partial) this.setSettingsRevision(partial.settingsRevision);
    if ('realtimeActive' in partial) this.setRealtimeActive(partial.realtimeActive);
  }
}
