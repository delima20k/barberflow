'use strict';

class AgendaState {
  #phase;
  #message;

  constructor({ phase = 'idle', message = '' } = {}) {
    this.setPhase(phase);
    this.setMessage(message);
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
    };
  }

  setPhase(phase) {
    this.#phase = typeof phase === 'string' && phase.trim() ? phase : 'idle';
  }

  setMessage(message) {
    this.#message = typeof message === 'string' ? message : '';
  }

  merge(partialState = {}) {
    if (Object.prototype.hasOwnProperty.call(partialState, 'phase')) {
      this.setPhase(partialState.phase);
    }
    if (Object.prototype.hasOwnProperty.call(partialState, 'message')) {
      this.setMessage(partialState.message);
    }
  }
}
