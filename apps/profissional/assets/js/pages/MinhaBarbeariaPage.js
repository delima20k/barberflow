'use strict';

class MinhaBarbeariaPage {
  #runtime;

  constructor(dependencies = {}) {
    if (typeof MinhaBarbeariaRuntimeController === 'undefined') {
      throw new Error('MinhaBarbeariaPage requer MinhaBarbeariaRuntimeController.');
    }
    this.#runtime = dependencies.runtime ?? new MinhaBarbeariaRuntimeController(dependencies);
  }

  bind() {
    this.#runtime.bind();
  }
}
