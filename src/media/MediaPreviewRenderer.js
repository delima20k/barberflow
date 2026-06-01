'use strict';

class MediaPreviewRenderer {
  #urlApi;
  #ownedUrls = new Set();

  constructor({ urlApi = globalThis.URL } = {}) {
    this.#urlApi = urlApi;
  }

  render(targetElement, { file = null, url = null, kind = 'image', alt = '' } = {}) {
    if (!targetElement) throw new Error('[MediaPreviewRenderer] targetElement e obrigatorio.');
    const src = url ?? this.#createUrl(file);
    if (!src) throw new Error('[MediaPreviewRenderer] file ou url e obrigatorio.');

    if ('src' in targetElement) targetElement.src = src;
    if (kind === 'video' && 'poster' in targetElement && url) targetElement.poster = url;
    if ('alt' in targetElement) targetElement.alt = alt;
    targetElement.dataset.mediaPreviewKind = kind;
    return { src, revoke: () => this.revoke(src) };
  }

  revoke(src) {
    if (!src || !this.#ownedUrls.has(src)) return;
    this.#urlApi?.revokeObjectURL?.(src);
    this.#ownedUrls.delete(src);
  }

  clear() {
    for (const src of this.#ownedUrls) this.#urlApi?.revokeObjectURL?.(src);
    this.#ownedUrls.clear();
  }

  #createUrl(file) {
    if (!file) return null;
    const src = this.#urlApi?.createObjectURL?.(file);
    if (src) this.#ownedUrls.add(src);
    return src;
  }
}

module.exports = MediaPreviewRenderer;
