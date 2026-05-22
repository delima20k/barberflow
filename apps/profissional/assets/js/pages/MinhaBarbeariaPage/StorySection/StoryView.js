'use strict';

class StoryView {
  #root;

  constructor(rootElement) { this.#root = rootElement; }

  render(state) {
    const slot = this.#root.querySelector?.('[data-minha-barbearia-story-section]');
    if (!slot) return;
    slot.dataset.storyCount = String(state.stories.length);
    slot.dataset.quotaHoje = String(state.quotaHoje);
  }
}
