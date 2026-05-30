'use strict';

class PortfolioGallery {
  #root;
  #viewer;
  #professionalId = null;
  #professionalMeta = {};
  #channel = null;
  #loading = false;

  constructor(root, options = {}) {
    this.#root = root;
    this.#viewer = options.viewer ?? new PortfolioViewerModal();
    this.#professionalMeta = options.professionalMeta ?? {};
  }

  setProfessionalMeta(meta = {}) {
    this.#professionalMeta = meta ?? {};
  }

  async load(professionalId) {
    if (!this.#root || !professionalId || this.#loading) return;
    this.#professionalId = professionalId;
    this.#loading = true;
    this.#renderSkeleton();

    try {
      const { data, error } = await BffApiService.profissionais.portfolio(professionalId, { limit: 12, offset: 0 });
      if (error) {
        this.#renderBlocked(error.status);
        return;
      }
      const items = this.#mapItems(data?.items ?? []);
      if (typeof PortfolioImageActions !== 'undefined') {
        await PortfolioImageActions.hidratar(items);
      }
      this.#renderItems(items);
      this.#subscribe();
    } catch {
      this.#renderBlocked(401);
    } finally {
      this.#loading = false;
    }
  }

  reset() {
    this.#viewer?.close();
    if (!this.#root) return;
    this.#root.innerHTML = '';
    this.#root.hidden = true;
    this.#professionalId = null;
    this.#unsubscribe();
  }

  #renderSkeleton() {
    this.#root.hidden = false;
    this.#root.innerHTML = `
      <div class="portfolio-section__header">
        <h2>Portfólio</h2>
      </div>
      <div class="portfolio-grid portfolio-grid--skeleton" aria-hidden="true">
        <span class="port-item portfolio-skeleton"></span>
        <span class="port-item portfolio-skeleton"></span>
        <span class="port-item portfolio-skeleton"></span>
        <span class="port-item portfolio-skeleton"></span>
      </div>
    `;
  }

  #renderBlocked(status) {
    this.#root.hidden = false;
    this.#root.innerHTML = '';
    this.#root.appendChild(this.#header());
    const message = status === 403 || status === 401
      ? 'Faça login como cliente para visualizar o portfólio'
      : 'Portfólio indisponível no momento';
    this.#root.appendChild(PortfolioEmptyState.render(message, 'locked'));
  }

  #renderItems(items) {
    this.#root.hidden = false;
    this.#root.innerHTML = '';
    this.#root.appendChild(this.#header());

    if (!items.length) {
      this.#root.appendChild(PortfolioEmptyState.render('Nenhum trabalho publicado ainda.', 'empty'));
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'portfolio-grid portfolio-gallery__grid portfolio-gallery__carousel';
    grid.setAttribute('role', 'list');
    items.forEach(item => grid.appendChild(new PortfolioCard(item, this.#viewer, items).render()));
    this.#root.appendChild(grid);
  }

  #header() {
    const header = document.createElement('div');
    header.className = 'portfolio-section__header';
    const title = document.createElement('h2');
    title.textContent = 'Portfólio';
    header.appendChild(title);
    return header;
  }

  #mapItems(items) {
    return items.map(item => ({
      ...item,
      professionalId: this.#professionalId,
      professionalName: this.#professionalMeta.fullName ?? this.#professionalMeta.full_name ?? null,
      professionalAvatarUrl: this.#professionalMeta.avatarUrl ?? this.#professionalMeta.avatar_url ?? '',
      thumbUrl: PortfolioGallery.#storageUrl(item.thumbnailPath || item.storagePath),
      fullUrl: PortfolioGallery.#storageUrl(item.storagePath || item.thumbnailPath),
    })).filter(item => item.thumbUrl || item.fullUrl);
  }

  static #storageUrl(path) {
    if (!path) return '';
    return ApiService.getPortfolioThumbUrl?.(path) || '';
  }

  #subscribe() {
    if (this.#channel || typeof SupabaseService === 'undefined' || !this.#professionalId) return;
    try {
      this.#channel = SupabaseService.channel(`portfolio-professional:${this.#professionalId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'portfolio_images',
          filter: `owner_id=eq.${this.#professionalId}`,
        }, () => {
          const id = this.#professionalId;
          this.reset();
          this.load(id);
        })
        .subscribe();
    } catch {
      this.#channel = null;
    }
  }

  #unsubscribe() {
    if (!this.#channel || typeof SupabaseService === 'undefined') return;
    SupabaseService.removeChannel(this.#channel);
    this.#channel = null;
  }
}
