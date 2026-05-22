'use strict';

class QueueState {
  #barbershopId;
  #entries;
  #realtimeActive;

  constructor({ barbershopId = null, entries = [], realtimeActive = false } = {}) {
    this.setBarbershopId(barbershopId);
    this.setEntries(entries);
    this.setRealtimeActive(realtimeActive);
  }
  get snapshot() { return { barbershopId: this.#barbershopId, entries: [...this.#entries], realtimeActive: this.#realtimeActive }; }
  setBarbershopId(id) { this.#barbershopId = typeof id === 'string' ? id : null; }
  setEntries(entries) { this.#entries = Array.isArray(entries) ? [...entries] : []; }
  setRealtimeActive(active) { this.#realtimeActive = active === true; }
  merge(partial = {}) {
    if ('barbershopId' in partial) this.setBarbershopId(partial.barbershopId);
    if ('entries' in partial) this.setEntries(partial.entries);
    if ('realtimeActive' in partial) this.setRealtimeActive(partial.realtimeActive);
  }
}
