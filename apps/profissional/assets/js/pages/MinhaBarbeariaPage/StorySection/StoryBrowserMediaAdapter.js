export class StoryBrowserMediaAdapter {
  // Upload de story sobe com no máximo 30s (a compressão no navegador corta para
  // 30s; +1s de folga para variação de timing do encoder).
  static #MAX_DURATION_SECONDS = 31;

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
    if (mediaType === 'video') {
      await this.#validarDuracaoVideo(file);
    }

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

  async #validarDuracaoVideo(file) {
    const duration = await this.#lerDuracaoVideo(file);
    if (duration <= StoryBrowserMediaAdapter.#MAX_DURATION_SECONDS) return;

    const duracao = Math.ceil(duration);
    throw new Error(`Este vídeo tem ${duracao}s. O limite máximo para Stories é de 30 segundos.`);
  }

  #lerDuracaoVideo(file) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        reject(new Error('Não foi possível ler a duração do vídeo.'));
        return;
      }

      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);
      let finalizado = false;

      const finalizar = (callback, value) => {
        if (finalizado) return;
        finalizado = true;
        URL.revokeObjectURL?.(objectUrl);
        video.removeAttribute?.('src');
        video.load?.();
        callback(value);
      };

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        if (!Number.isFinite(duration)) {
          finalizar(reject, new Error('Não foi possível ler a duração do vídeo.'));
          return;
        }
        finalizar(resolve, duration);
      };
      video.onerror = () => finalizar(reject, new Error('Não foi possível ler a duração do vídeo.'));
      video.src = objectUrl;
    });
  }
}
