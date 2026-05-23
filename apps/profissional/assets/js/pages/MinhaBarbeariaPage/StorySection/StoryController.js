import { SectionEventCatalog } from '../../../../../../../events/catalog.js';

export class StoryController {
  #state;
  #view;
  #mediaAdapter;
  #emit = null;

  constructor({ state, view, mediaAdapter = null } = {}) {
    if (!state?.merge || !view?.render) throw new Error('StoryController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
    this.#mediaAdapter = mediaAdapter;
  }

  init({ emit } = {}) { this.#emit = emit; this.render(); }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    this.#state.merge(partial);
    this.render();
    this.#emit?.(SectionEventCatalog.STORY_CHANGED, this.#state.snapshot);
  }
  get mediaAdapter() { return this.#mediaAdapter; }
  destroy() { this.#emit = null; }
}
