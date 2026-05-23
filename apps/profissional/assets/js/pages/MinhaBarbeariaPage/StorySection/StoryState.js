export class StoryState {
  #stories;
  #quotaHoje;
  #shop;
  #perfilId;

  constructor({ stories = [], quotaHoje = 0, shop = null, perfilId = null } = {}) {
    this.setStories(stories);
    this.setQuotaHoje(quotaHoje);
    this.setShop(shop);
    this.setPerfilId(perfilId);
  }

  get snapshot() {
    return { stories: [...this.#stories], quotaHoje: this.#quotaHoje, shop: this.#shop, perfilId: this.#perfilId };
  }

  setStories(stories) { this.#stories = Array.isArray(stories) ? [...stories] : []; }
  setQuotaHoje(quotaHoje) { this.#quotaHoje = Number.isFinite(Number(quotaHoje)) ? Number(quotaHoje) : 0; }
  setShop(shop) { this.#shop = shop && typeof shop === 'object' ? { ...shop } : null; }
  setPerfilId(perfilId) { this.#perfilId = typeof perfilId === 'string' ? perfilId : null; }

  merge(partial = {}) {
    if ('stories' in partial) this.setStories(partial.stories);
    if ('quotaHoje' in partial) this.setQuotaHoje(partial.quotaHoje);
    if ('shop' in partial) this.setShop(partial.shop);
    if ('perfilId' in partial) this.setPerfilId(partial.perfilId);
  }
}
