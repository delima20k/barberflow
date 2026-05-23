export class NotificationView {
  #root;
  constructor(rootElement) { this.#root = rootElement; }
  render(state) {
    const region = this.#root.querySelector?.('[data-minha-barbearia-notification-section]');
    if (!region) return;
    region.dataset.pendingNotifications = String(state.pending.length);
    region.dataset.settingsRevision = state.settingsRevision ?? '';
  }
}
