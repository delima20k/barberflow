'use strict';

class StorySection extends PageSection {
  #controller;
  constructor(rootElement, dependencies = {}) {
    super(rootElement, dependencies);
    if (!dependencies.controller?.init) throw new Error('StorySection requer StoryController injetado.');
    this.#controller = dependencies.controller;
  }
  init() { if (!this.initialized) { super.init(); this.#controller.init({ emit: this.emit.bind(this), on: this.on.bind(this) }); } }
  render() { this.#controller.render(); }
  update(partial) { this.#controller.update(partial); }
  destroy() { this.#controller.destroy(); super.destroy(); }
}
