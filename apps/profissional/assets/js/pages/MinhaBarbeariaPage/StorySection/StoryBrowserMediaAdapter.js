export class StoryBrowserMediaAdapter {
  #mediaP2P;

  constructor({ mediaP2P } = {}) {
    if (!mediaP2P?.registrar || !mediaP2P?.fazerUpload) {
      throw new Error('StoryBrowserMediaAdapter requer mediaP2P com registrar() e fazerUpload().');
    }
    this.#mediaP2P = mediaP2P;
  }

  async upload({ file, uid, barbershopId, expiresAt }) {
    if (!file) throw new Error('StoryBrowserMediaAdapter requer arquivo.');
    if (!uid) throw new Error('StoryBrowserMediaAdapter requer uid.');
    if (!barbershopId) throw new Error('StoryBrowserMediaAdapter requer barbershopId.');

    const mediaType = file.type?.startsWith('video') ? 'video' : 'image';
    const blobUrl = await this.#mediaP2P.registrar(file, uid);
    if (!blobUrl) return null;

    const uploadResult = await this.#mediaP2P.fazerUpload(uid, 'stories', {
      barbershopId,
      mediaType,
      expiresAt,
    });

    return {
      ...uploadResult,
      blobUrl,
      mediaType,
      expiresAt,
    };
  }
}
