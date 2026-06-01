'use strict';

class ImageCompressionService {
  static PRESETS = Object.freeze({
    THUMB: Object.freeze({ name: 'thumb', maxWidth: 300, quality: 0.62 }),
    MEDIUM: Object.freeze({ name: 'medium', maxWidth: 900, quality: 0.76 }),
    FULL: Object.freeze({ name: 'full', maxWidth: 1600, quality: 0.82 }),
  });

  static #MAX_BYTES = 16 * 1024 * 1024;
  static #webpSupport = null;
  static #queue = Promise.resolve();

  static async compress(fileOrBuffer, {
    contentType = '',
    preset = 'FULL',
    onProgress = null,
    signal = null,
  } = {}) {
    return ImageCompressionService.#enqueue(async () => {
      ImageCompressionService.#throwIfAborted(signal);
      const source = await ImageCompressionService.#source(fileOrBuffer, contentType);
      const selected = ImageCompressionService.#preset(preset);
      ImageCompressionService.#validateSource(source);
      onProgress?.({ stage: 'compression-started', progress: 0.05 });

      if (!ImageCompressionService.#isCompressible(source.contentType)) {
        return ImageCompressionService.#passthrough(source, 'Arquivo mantido sem compressao local.');
      }

      const bitmap = await createImageBitmap(source.blob);
      ImageCompressionService.#throwIfAborted(signal);
      const canvas = ImageCompressionService.#draw(bitmap, selected.maxWidth);
      bitmap.close?.();
      const outputMime = await ImageCompressionService.supportsWebP() ? 'image/webp' : 'image/jpeg';
      onProgress?.({ stage: 'compressing', progress: 0.55 });
      const blob = await ImageCompressionService.#toBlob(canvas, outputMime, selected.quality);
      const buffer = await blob.arrayBuffer();
      const blurPlaceholder = await ImageCompressionService.blurPlaceholder(source.blob, { signal }).catch(() => null);
      onProgress?.({ stage: 'compression-completed', progress: 1 });
      return {
        buffer,
        blob,
        contentType: blob.type || outputMime,
        originalBytes: source.size,
        bytes: blob.size,
        preset: selected.name,
        width: canvas.width,
        height: canvas.height,
        blurPlaceholder,
        compressed: blob.size < source.size,
      };
    });
  }

  static async blurPlaceholder(fileOrBlob, { signal = null } = {}) {
    ImageCompressionService.#throwIfAborted(signal);
    const source = await ImageCompressionService.#source(fileOrBlob, fileOrBlob?.type ?? 'image/jpeg');
    if (!ImageCompressionService.#isCompressible(source.contentType)) return null;
    const bitmap = await createImageBitmap(source.blob);
    const canvas = ImageCompressionService.#draw(bitmap, 24);
    bitmap.close?.();
    const blob = await ImageCompressionService.#toBlob(canvas, 'image/webp', 0.34);
    const dataUrl = await ImageCompressionService.#blobToDataUrl(blob);
    ImageCompressionService.#throwIfAborted(signal);
    return dataUrl;
  }

  static async supportsWebP() {
    if (ImageCompressionService.#webpSupport !== null) return ImageCompressionService.#webpSupport;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    ImageCompressionService.#webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    return ImageCompressionService.#webpSupport;
  }

  static #enqueue(task) {
    const run = ImageCompressionService.#queue.then(task, task);
    ImageCompressionService.#queue = run.catch(() => {});
    return run;
  }

  static async #source(fileOrBuffer, contentType) {
    if (fileOrBuffer instanceof Blob) {
      return { blob: fileOrBuffer, contentType: fileOrBuffer.type || contentType, size: fileOrBuffer.size };
    }
    const blob = new Blob([fileOrBuffer], { type: contentType || 'application/octet-stream' });
    return { blob, contentType: blob.type, size: blob.size };
  }

  static #validateSource(source) {
    if (!source.size || source.size < 1) throw new Error('Imagem vazia ou invalida.');
    if (source.size > ImageCompressionService.#MAX_BYTES) throw new Error('Imagem acima do limite permitido.');
    if (source.contentType === 'image/svg+xml') throw new Error('SVG nao e permitido para upload de imagens.');
  }

  static #isCompressible(contentType) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(String(contentType).toLowerCase());
  }

  static #preset(preset) {
    const key = String(preset || 'FULL').toUpperCase();
    return ImageCompressionService.PRESETS[key] ?? ImageCompressionService.PRESETS.FULL;
  }

  static #draw(bitmap, maxWidth) {
    const ratio = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  }

  static #toBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('Falha ao comprimir imagem.'));
        else resolve(blob);
      }, mime, quality);
    });
  }

  static #blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Falha ao gerar placeholder.'));
      reader.readAsDataURL(blob);
    });
  }

  static #passthrough(source, reason) {
    return source.blob.arrayBuffer().then((buffer) => ({
      buffer,
      blob: source.blob,
      contentType: source.contentType,
      originalBytes: source.size,
      bytes: source.size,
      preset: 'passthrough',
      width: null,
      height: null,
      blurPlaceholder: null,
      compressed: false,
      reason,
    }));
  }

  static #throwIfAborted(signal) {
    if (signal?.aborted) throw new Error('Compressao cancelada.');
  }
}

if (typeof window !== 'undefined') {
  window.ImageCompressionService = ImageCompressionService;
}
