import { SectionEventCatalog } from '../../../../../../../shared/js/SectionEventCatalog.js';

export class AgendaController {
  #state;
  #view;
  #emit = null;
  #unsubscribeSettings = null;
  #readyEvent = null;

  constructor({ state, view, readyEvent = null } = {}) {
    if (!state || typeof state.merge !== 'function') {
      throw new Error('AgendaController requer AgendaState injetado.');
    }
    if (!view || typeof view.render !== 'function') {
      throw new Error('AgendaController requer AgendaView injetada.');
    }
    this.#state = state;
    this.#view = view;
    this.#readyEvent = readyEvent;
  }

  get state() {
    return this.#state;
  }

  init({ emit = null, on = null } = {}) {
    this.#emit = emit;
    if (typeof on === 'function' && typeof SectionEventCatalog !== 'undefined') {
      this.#unsubscribeSettings = on(
        SectionEventCatalog.SETTINGS_CHANGED,
        this.#onSettingsChanged.bind(this),
      );
    }
    this.#state.setPhase('ready');
    this.render();
    if (typeof this.#emit === 'function' && this.#readyEvent) {
      this.#emit(this.#readyEvent, this.#state.snapshot);
    }
  }

  render() {
    this.#view.render(this.#state.snapshot);
  }

  update(partialState) {
    this.#state.merge(partialState);
    this.render();
  }

  destroy() {
    this.#unsubscribeSettings?.();
    this.#unsubscribeSettings = null;
    this.#emit = null;
    this.#state.setPhase('destroyed');
    this.#view.render(this.#state.snapshot);
  }

  #onSettingsChanged(payload = {}) {
    this.update({ lastSettingsChange: payload.changedAt ?? null });
  }
}
