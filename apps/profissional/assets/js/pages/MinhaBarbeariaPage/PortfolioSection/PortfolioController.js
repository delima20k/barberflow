import { SectionEventCatalog } from '../../../../../../../shared/js/SectionEventCatalog.js';

export class PortfolioController {
  static #MAX_BYTES = 8 * 1024 * 1024;

  #state;
  #view;
  #emit = null;
  #carregadoBarbershopId = null;
  #uploadHandler = null;
  constructor({ state, view } = {}) {
    if (!state?.merge || !view?.render) throw new Error('PortfolioController requer State e View injetados.');
    this.#state = state;
    this.#view = view;
  }
  init({ emit } = {}) {
    this.#emit = emit;
    this.#uploadHandler = file => this.upload(file);
    this.#view.bind?.({
      onUpload: this.#uploadHandler,
      onRetry: () => this.#load(),
      onRemove: imageId => this.remove(imageId),
    });
    this.render();
  }

  async remove(imageId) {
    if (!imageId || !this.#state.snapshot.canUpload) return;
    this.update({ error: null });
    const resultado = await ImageDeletionService.confirmarEExcluir(imageId);
    if (resultado.cancelado) return;
    if (resultado.deleted) {
      const atuais = this.#state.snapshot.items;
      this.update({ items: atuais.filter(img => img.id !== imageId) });
      return;
    }
    this.update({ error: resultado.error?.message ?? 'Nao foi possivel remover a imagem.' });
  }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    const anterior = this.#state.snapshot.barbershopId;
    this.#state.merge(partial);
    const atual = this.#state.snapshot.barbershopId;
    if (!atual && anterior) {
      this.#carregadoBarbershopId = null;
      this.#state.merge({ items: [], loading: false, uploading: false, error: null });
    }
    this.render();
    this.#emit?.(SectionEventCatalog.PORTFOLIO_CHANGED, this.#state.snapshot);
    if (atual && atual !== anterior && atual !== this.#carregadoBarbershopId) {
      void this.#load();
    }
  }
  async upload(file) {
    if (!file || !this.#state.snapshot.canUpload) return;
    if (!String(file.type ?? '').startsWith('image/')) {
      this.update({ error: 'Envie apenas imagens.' });
      return;
    }
    if (Number(file.size ?? 0) > PortfolioController.#MAX_BYTES) {
      this.update({ error: 'Imagem excede o tamanho maximo de 8 MB.' });
      return;
    }

    this.update({ uploading: true, error: null });
    try {
      const buffer = await file.arrayBuffer();
      const { data, error } = await BffApiService.profissionais.uploadPortfolioImagem(buffer, file.type);
      if (error) throw error;
      const item = PortfolioController.#normalizarItem(data);
      const atuais = this.#state.snapshot.items;
      this.update({ items: item?.id ? [item, ...atuais.filter(img => img.id !== item.id)] : atuais });
      await this.#load();
    } catch (err) {
      this.update({ error: err?.message ?? 'Nao foi possivel enviar a imagem.' });
    } finally {
      this.update({ uploading: false });
    }
  }
  destroy() {
    this.#view.destroy?.();
    this.#emit = null;
    this.#uploadHandler = null;
  }

  async #load() {
    const { barbershopId } = this.#state.snapshot;
    if (!barbershopId) return;

    this.#carregadoBarbershopId = barbershopId;
    this.update({ loading: true, error: null });
    try {
      const { data, error } = await BffApiService.barbearias.portfolio(barbershopId, { limit: 30, offset: 0 });
      if (error) throw error;
      if (this.#state.snapshot.barbershopId !== barbershopId) return;
      const items = (data?.items ?? data ?? []).map(item => PortfolioController.#normalizarItem(item));
      this.update({ items });
    } catch (err) {
      if (this.#state.snapshot.barbershopId === barbershopId) {
        this.update({ error: err?.message ?? 'Nao foi possivel carregar o portfolio.' });
      }
    } finally {
      if (this.#state.snapshot.barbershopId === barbershopId) {
        this.update({ loading: false });
      }
    }
  }

  static #normalizarItem(item = {}) {
    const storagePath = item.storagePath ?? item.storage_path ?? null;
    const thumbnailPath = item.thumbnailPath ?? item.thumbnail_path ?? storagePath;
    const thumbUrl = thumbnailPath && typeof ApiService !== 'undefined'
      ? ApiService.getPortfolioThumbUrl(thumbnailPath)
      : '';
    const fullUrl = storagePath && typeof ApiService !== 'undefined'
      ? ApiService.getPortfolioThumbUrl(storagePath)
      : thumbUrl;
    const professionalAvatarPath = item.professionalAvatarPath ?? item.professional_avatar_path ?? null;
    const professionalAvatarUrl = professionalAvatarPath && typeof ApiService !== 'undefined'
      ? ApiService.getAvatarUrl(professionalAvatarPath)
      : '';
    return {
      id: item.id ?? null,
      ownerId: item.ownerId ?? item.owner_id ?? item.professionalId ?? null,
      professionalId: item.professionalId ?? item.ownerId ?? item.owner_id ?? null,
      professionalName: item.professionalName ?? item.professional_name ?? null,
      professionalAvatarPath,
      professionalAvatarUrl,
      title: item.title ?? 'Trabalho do portfólio',
      storagePath,
      thumbnailPath,
      likesCount: item.likesCount ?? item.likes_count ?? 0,
      interactions: Array.isArray(item.interactions) ? item.interactions : [],
      thumbUrl,
      fullUrl,
    };
  }
}
