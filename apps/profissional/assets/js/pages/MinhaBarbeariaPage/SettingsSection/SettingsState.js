export class SettingsState {
  #shop;
  #services;
  #changedAt;

  constructor({ shop = null, services = [], changedAt = null } = {}) {
    this.setShop(shop);
    this.setServices(services);
    this.setChangedAt(changedAt);
  }
  get snapshot() { return { shop: this.#shop, services: [...this.#services], changedAt: this.#changedAt }; }
  setShop(shop) { this.#shop = shop && typeof shop === 'object' ? { ...shop } : null; }
  setServices(services) { this.#services = Array.isArray(services) ? [...services] : []; }
  setChangedAt(changedAt) { this.#changedAt = typeof changedAt === 'string' ? changedAt : null; }
  merge(partial = {}) {
    if ('shop' in partial) this.setShop(partial.shop);
    if ('services' in partial) this.setServices(partial.services);
    if ('changedAt' in partial) this.setChangedAt(partial.changedAt);
  }
}
