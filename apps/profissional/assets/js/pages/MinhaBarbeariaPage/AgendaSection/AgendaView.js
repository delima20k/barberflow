'use strict';

class AgendaView {
  #rootElement;

  constructor(rootElement) {
    if (!rootElement || typeof rootElement.querySelector !== 'function') {
      throw new Error('AgendaView requer rootElement consultavel.');
    }
    this.#rootElement = rootElement;
  }

  render(state) {
    const output = this.#rootElement.querySelector('[data-minha-barbearia-agenda-section]');
    if (!output) return;

    output.dataset.sectionPhase = state.phase;
    output.textContent = state.message;
    output.hidden = state.phase === 'destroyed';
  }
}
