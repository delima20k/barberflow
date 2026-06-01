export class PortfolioState {
  #items;
  #barbershopId;
  #perfilId;
  #canUpload;
  #loading;
  #uploading;
  #error;

  constructor({ items = [], barbershopId = null, perfilId = null, canUpload = false } = {}) {
    this.setItems(items);
    this.setContext({ barbershopId, perfilId, canUpload });
    this.#loading = false;
    this.#uploading = false;
    this.#error = null;
  }
  get snapshot() {
    return {
      items: [...this.#items],
      barbershopId: this.#barbershopId,
      perfilId: this.#perfilId,
      canUpload: this.#canUpload,
      loading: this.#loading,
      uploading: this.#uploading,
      error: this.#error,
    };
  }
  setItems(items) { this.#items = Array.isArray(items) ? [...items] : []; }
  setContext({ barbershopId = this.#barbershopId, perfilId = this.#perfilId, canUpload = this.#canUpload } = {}) {
    this.#barbershopId = typeof barbershopId === 'string' && barbershopId ? barbershopId : null;
    this.#perfilId = typeof perfilId === 'string' && perfilId ? perfilId : null;
    this.#canUpload = Boolean(canUpload);
  }
  merge(partial = {}) {
    if ('items' in partial) this.setItems(partial.items);
    if ('barbershopId' in partial || 'perfilId' in partial || 'canUpload' in partial) this.setContext(partial);
    if ('loading' in partial) this.#loading = Boolean(partial.loading);
    if ('uploading' in partial) this.#uploading = Boolean(partial.uploading);
    if ('error' in partial) this.#error = partial.error ? String(partial.error) : null;
  }
}
