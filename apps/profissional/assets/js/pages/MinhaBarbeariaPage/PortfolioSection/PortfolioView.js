export class PortfolioView {
  #root;
  #region = null;
  #grid = null;
  #status = null;
  #upload = null;
  #input = null;
  #viewer = null;
  #onUpload = null;
  #onRetry = null;
  #boundChange = null;
  #boundClick = null;

  constructor(rootElement) { this.#root = rootElement; }

  bind({ onUpload, onRetry } = {}) {
    this.#cache();
    this.#onUpload = onUpload;
    this.#onRetry = onRetry;
    if (!this.#input || this.#boundChange) return;
    this.#boundChange = e => {
      const file = e.target?.files?.[0] ?? null;
      if (file) this.#onUpload?.(file);
      e.target.value = '';
    };
    this.#boundClick = e => {
      const retry = e.target.closest?.('[data-mb-portfolio-retry]');
      if (retry) this.#onRetry?.();
    };
    this.#input.addEventListener('change', this.#boundChange);
    this.#region?.addEventListener('click', this.#boundClick);
  }

  render(state) {
    this.#cache();
    if (!this.#region) return;
    this.#region.hidden = false;
    this.#region.dataset.portfolioCount = String(state.items.length);
    this.#renderUpload(state);
    this.#renderStatus(state);
    this.#renderGrid(state);
  }

  destroy() {
    if (this.#input && this.#boundChange) this.#input.removeEventListener('change', this.#boundChange);
    if (this.#region && this.#boundClick) this.#region.removeEventListener('click', this.#boundClick);
    this.#boundChange = null;
    this.#boundClick = null;
    this.#onUpload = null;
    this.#onRetry = null;
  }

  #cache() {
    this.#region ??= this.#root.querySelector?.('[data-minha-barbearia-portfolio-section]') ?? null;
    this.#grid ??= this.#region?.querySelector?.('[data-mb-portfolio-grid]') ?? null;
    this.#status ??= this.#region?.querySelector?.('[data-mb-portfolio-status]') ?? null;
    this.#upload ??= this.#region?.querySelector?.('[data-mb-portfolio-upload]') ?? null;
    this.#input ??= this.#region?.querySelector?.('#mb-portfolio-input') ?? null;
  }

  #renderUpload(state) {
    if (!this.#upload) return;
    this.#upload.hidden = !state.canUpload;
    this.#upload.classList.toggle('mb-portfolio-upload--busy', Boolean(state.uploading));
    this.#upload.setAttribute('aria-busy', String(Boolean(state.uploading)));
  }

  #renderStatus(state) {
    if (!this.#status) return;
    if (state.loading) {
      this.#status.textContent = 'Carregando portfólio...';
      return;
    }
    if (state.uploading) {
      this.#status.textContent = 'Enviando imagem...';
      return;
    }
    if (state.error) {
      this.#status.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = state.error;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mbPortfolioRetry = 'true';
      btn.textContent = 'Tentar novamente';
      this.#status.append(span, ' ', btn);
      return;
    }
    if (!state.items.length) {
      this.#status.textContent = state.canUpload
        ? 'Nenhuma imagem ainda. Poste o primeiro trabalho da barbearia.'
        : 'Nenhuma imagem no portfólio da barbearia ainda.';
      return;
    }
    this.#status.textContent = '';
  }

  #renderGrid(state) {
    if (!this.#grid) return;
    this.#grid.innerHTML = '';
    if (state.loading) {
      for (let i = 0; i < 4; i++) {
        const skel = document.createElement('div');
        skel.className = 'mb-portfolio-card mb-portfolio-card--skel';
        this.#grid.appendChild(skel);
      }
      return;
    }
    state.items.forEach((item, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mb-portfolio-card';
      card.setAttribute('aria-label', item.title ?? 'Abrir imagem do portfólio');
      card.addEventListener('click', () => this.#abrirViewer(item, state.items));

      const img = document.createElement('img');
      img.src = item.thumbUrl || item.fullUrl || '';
      img.alt = item.title ?? '';
      img.loading = index < 4 ? 'eager' : 'lazy';
      img.onerror = () => { img.style.opacity = '0'; };
      card.appendChild(img);

      if (item.professionalName) {
        const meta = document.createElement('span');
        meta.className = 'mb-portfolio-card__barber';
        if (item.professionalAvatarUrl) {
          const avatar = document.createElement('img');
          avatar.className = 'mb-portfolio-card__avatar';
          avatar.src = item.professionalAvatarUrl;
          avatar.alt = '';
          avatar.loading = 'lazy';
          avatar.onerror = () => { avatar.hidden = true; };
          meta.appendChild(avatar);
        }
        const name = document.createElement('span');
        name.className = 'mb-portfolio-card__nome';
        name.textContent = item.professionalName;
        meta.appendChild(name);
        card.appendChild(meta);
      }
      this.#grid.appendChild(card);
    });
  }

  #abrirViewer(item, items) {
    if (!item) return;
    if (typeof PortfolioPrismViewer === 'undefined') return;
    this.#viewer ??= new PortfolioPrismViewer();
    this.#viewer.open(item, items);
  }
}
