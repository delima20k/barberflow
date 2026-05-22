'use strict';

class AgendaSection extends PageSection {
  #controller;

  constructor(rootElement, dependencies = {}) {
    super(rootElement, dependencies);
    if (!dependencies.controller || typeof dependencies.controller.init !== 'function') {
      throw new Error('AgendaSection requer AgendaController injetado.');
    }
    this.#controller = dependencies.controller;
  }

  init() {
    if (this.initialized) return;
    super.init();
    this.#controller.init({ emit: this.emit.bind(this) });
  }

  render() {
    this.#controller.render();
  }

  update(partialState = {}) {
    this.#controller.update(partialState);
  }

  destroy() {
    this.#controller.destroy();
    super.destroy();
  }
}
