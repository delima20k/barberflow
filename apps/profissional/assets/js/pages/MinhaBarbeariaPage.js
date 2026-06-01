import { MinhaBarbeariaRuntimeController } from './MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js';

export class MinhaBarbeariaPage {
  #runtime;

  constructor(dependencies = {}) {
    this.#runtime = dependencies.runtime ?? new MinhaBarbeariaRuntimeController(dependencies);
  }

  bind() {
    this.#runtime.bind();
  }
}
