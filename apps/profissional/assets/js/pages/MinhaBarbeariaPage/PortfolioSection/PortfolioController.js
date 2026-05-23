import { SectionEventCatalog } from '../../../../../../../shared/js/SectionEventCatalog.js';

export class PortfolioController {
  #state;
  #view;
  #emit = null;
  constructor({ state, view } = {}) {
    if (!state?.merge || !view?.render) throw new Error('PortfolioController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
  }
  init({ emit } = {}) { this.#emit = emit; this.render(); }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    this.#state.merge(partial);
    this.render();
    this.#emit?.(SectionEventCatalog.PORTFOLIO_CHANGED, this.#state.snapshot);
  }
  destroy() { this.#emit = null; }
}
