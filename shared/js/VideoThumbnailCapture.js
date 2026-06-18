'use strict';

/**
 * VideoThumbnailCapture
 *
 * Extrai o primeiro frame de um arquivo de vídeo via Canvas API (navegador).
 * Não depende de FFmpeg nem de Workers — funciona em Vercel serverless.
 * Revoga sempre o ObjectURL ao terminar (sem vazamento de memória).
 *
 * @example
 *   const blob = await VideoThumbnailCapture.capturar(videoFile);
 *   if (blob) {
 *     const base64 = await VideoThumbnailCapture.paraBase64(blob);
 *     BffApiService.media.salvarThumb(mediaId, base64).catch(() => {});
 *   }
 */
class VideoThumbnailCapture {
  /**
   * Extrai um frame do vídeo no instante `timeMs` (padrão: 500ms).
   * @param {File|Blob} videoFile
   * @param {number} [timeMs=500]
   * @returns {Promise<Blob|null>}
   */
  static async capturar(videoFile, timeMs = 500) {
    if (!videoFile || !videoFile.type?.startsWith('video')) return null;
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(videoFile);
      const video = document.createElement('video');
      video.muted   = true;
      video.preload = 'metadata';

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror          = reject;
        video.src              = objectUrl;
      });

      const seekTime    = Math.min(timeMs / 1000, Math.max(0, (video.duration ?? 0) - 0.1));
      video.currentTime = seekTime;

      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror  = reject;
      });

      const canvas   = document.createElement('canvas');
      canvas.width   = video.videoWidth  || 480;
      canvas.height  = video.videoHeight || 854;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob ?? null), 'image/jpeg', 0.85);
      });
    } catch {
      return null;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  /**
   * Converte Blob para string base64 sem prefixo `data:...`.
   * @param {Blob|null} blob
   * @returns {Promise<string|null>}
   */
  static async paraBase64(blob) {
    if (!blob) return null;
    return new Promise((resolve, reject) => {
      const reader    = new FileReader();
      reader.onload   = () => resolve(String(reader.result ?? '').split(',')[1] ?? null);
      reader.onerror  = reject;
      reader.readAsDataURL(blob);
    });
  }
}
