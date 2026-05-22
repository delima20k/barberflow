'use strict';

class SettingsController {
  #state;
  #view;
  #emit = null;
  constructor({ state, view } = {}) {
    if (!state?.merge || !view?.render) throw new Error('SettingsController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
  }
  init({ emit } = {}) { this.#emit = emit; this.render(); }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    this.#state.merge({ ...partial, changedAt: partial?.changedAt ?? new Date().toISOString() });
    this.render();
    this.#emit?.(SectionEventCatalog.SETTINGS_CHANGED, this.#state.snapshot);
  }
  destroy() { this.#emit = null; }
}
