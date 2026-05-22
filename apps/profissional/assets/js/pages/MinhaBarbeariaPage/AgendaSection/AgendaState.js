'use strict';

class AgendaState {
  #phase;
  #message;
  #lastSettingsChange;

  constructor({ phase = 'idle', message = '', lastSettingsChange = null } = {}) {
    this.setPhase(phase);
    this.setMessage(message);
    this.setLastSettingsChange(lastSettingsChange);
  }

  get phase() {
    return this.#phase;
  }

  get message() {
    return this.#message;
  }

  get snapshot() {
    return {
      phase: this.#phase,
      message: this.#message,
      lastSettingsChange: this.#lastSettingsChange,
    };
  }

  setPhase(phase) {
    this.#phase = typeof phase === 'string' && phase.trim() ? phase : 'idle';
  }

  setMessage(message) {
    this.#message = typeof message === 'string' ? message : '';
  }

  setLastSettingsChange(value) {
    this.#lastSettingsChange = typeof value === 'string' ? value : null;
  }

  merge(partialState = {}) {
    if (Object.prototype.hasOwnProperty.call(partialState, 'phase')) {
      this.setPhase(partialState.phase);
    }
    if (Object.prototype.hasOwnProperty.call(partialState, 'message')) {
      this.setMessage(partialState.message);
    }
    if (Object.prototype.hasOwnProperty.call(partialState, 'lastSettingsChange')) {
      this.setLastSettingsChange(partialState.lastSettingsChange);
    }
  }
}
