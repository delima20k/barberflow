import { PageSection } from '../../../../../../../shared/js/PageSection.js';

export class AnalyticsSection extends PageSection {
  #controller;
  constructor(rootElement, dependencies = {}) { super(rootElement, dependencies); this.#controller = dependencies.controller; if (!this.#controller?.init) throw new Error('AnalyticsSection requer AnalyticsController injetado.'); }
  init() { if (!this.initialized) { super.init(); this.#controller.init({ emit: this.emit.bind(this), on: this.on.bind(this) }); } }
  render() { this.#controller.render(); }
  update(partial) { this.#controller.update(partial); }
  destroy() { this.#controller.destroy(); super.destroy(); }
}
