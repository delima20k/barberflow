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

    // Captura thumbnail do primeiro frame e salva de forma assíncrona (fire-and-forget).
    // Não bloqueia o fluxo de upload — falhas são silenciosas por design.
    if (mediaType === 'video' && uploadResult?.mediaId
        && typeof VideoThumbnailCapture !== 'undefined'
        && typeof BffApiService !== 'undefined') {
      VideoThumbnailCapture.capturar(file).then(async blob => {
        if (!blob) return;
        const base64 = await VideoThumbnailCapture.paraBase64(blob);
        if (base64) BffApiService.media.salvarThumb(uploadResult.mediaId, base64).catch(() => {});
      }).catch(() => {});
    }

    return {
      ...uploadResult,
      blobUrl,
      mediaType,
      expiresAt,
    };
  }
}
