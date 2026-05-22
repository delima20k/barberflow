'use strict';

class SettingsView {
  #root;
  constructor(rootElement) { this.#root = rootElement; }
  render(state) {
    const region = this.#root.querySelector?.('[data-minha-barbearia-settings-section]');
    if (!region) return;
    region.dataset.serviceCount = String(state.services.length);
    region.dataset.settingsChangedAt = state.changedAt ?? '';
  }
}
