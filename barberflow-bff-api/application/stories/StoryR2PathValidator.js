'use strict';

/**
 * StoryR2PathValidator — valida e normaliza object keys do Cloudflare R2
 * restritas ao prefixo exclusivo de Stories.
 *
 * Protege contra:
 *   - URLs completas
 *   - Barras invertidas
 *   - Encoding suspeito (%2e%2e, %2f)
 *   - Path traversal (..)
 *   - Keys fora do prefixo 'stories/'
 *   - Prefixo raiz sem objeto específico
 *
 * Camada: application
 */
class StoryR2PathValidator {
  static #ALLOWED_PREFIX = 'stories/';

  /**
   * Valida e retorna a key normalizada.
   * Lança Error se a key for inválida.
   * @param {string} rawKey
   * @returns {string} key normalizada
   */
  static validar(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('Key R2 inválida: ausente ou não string.');
    }
    if (/^https?:\/\//i.test(rawKey)) {
      throw new Error('Key R2 inválida: URL completa não permitida.');
    }
    if (/[\\]/.test(rawKey)) {
      throw new Error('Key R2 inválida: barra invertida detectada.');
    }
    if (/%2e%2e/i.test(rawKey) || /%2f/i.test(rawKey)) {
      throw new Error('Key R2 inválida: encoding suspeito detectado.');
    }
    const normalized = rawKey.split('/').reduce((acc, seg) => {
      if (seg === '..') acc.pop();
      else if (seg !== '.') acc.push(seg);
      return acc;
    }, []).join('/');
    if (normalized !== rawKey) {
      throw new Error('Key R2 inválida: path traversal detectado.');
    }
    if (!normalized.startsWith(StoryR2PathValidator.#ALLOWED_PREFIX)) {
      throw new Error(
        `Key R2 inválida: fora do prefixo "${StoryR2PathValidator.#ALLOWED_PREFIX}".`
      );
    }
    if (normalized === StoryR2PathValidator.#ALLOWED_PREFIX) {
      throw new Error('Key R2 inválida: prefixo raiz sem objeto específico não permitido.');
    }
    return normalized;
  }

  /**
   * Tenta extrair o UUID de mediaId de uma key R2 de stories.
   *
   * O mediaId é sempre o NOME DO ARQUIVO (último segmento sem extensão),
   * pois o MediaUploadService grava em:
   *   stories/{ownerId}/incoming/{mediaId}.{ext}
   *   stories/{ownerId}/thumbnails/{mediaId}.jpg
   * Atenção: parts[1] é o ownerId (também UUID) — NÃO usar para mediaId.
   *
   * Retorna null se o nome do arquivo não for um UUID (ex.: catálogo de
   * áudio em stories/audio/..., variantes com sufixo, etc.) — nesse caso
   * a FASE E ignora o objeto com segurança.
   * @param {string} key
   * @returns {string|null}
   */
  static extrairMediaId(key) {
    if (!key || typeof key !== 'string') return null;
    const parts = key.split('/');
    if (parts.length < 2 || parts[0] !== 'stories') return null;
    const filename = parts[parts.length - 1];
    const semExtensao = filename.replace(/\.[^.]+$/, '');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(semExtensao) ? semExtensao : null;
  }

  static get ALLOWED_PREFIX() {
    return StoryR2PathValidator.#ALLOWED_PREFIX;
  }
}

module.exports = { StoryR2PathValidator };
