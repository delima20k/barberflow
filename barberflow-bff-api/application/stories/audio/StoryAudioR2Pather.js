'use strict';

/**
 * StoryAudioR2Pather — constrói as object keys do R2 para os áudios de story.
 * Mantém tudo sob o prefixo 'stories/' (compatível com StoryR2PathValidator).
 *
 *   stories/audio/{genreSlug}/{musicId}.{ext}
 *   stories/audio/catalog.json
 *
 * Puro — sem I/O, totalmente testável.
 * Camada: application
 */
class StoryAudioR2Pather {
  static PREFIX = 'stories/audio';

  /** Slug seguro p/ key (a-z 0-9 e hífens), sem acentos. */
  static slug(str) {
    return String(str ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'sem-nome';
  }

  /**
   * @param {{ genre: string, musicId: string, ext: string }} p
   * @returns {string} object key
   */
  static keyFor({ genre, musicId, ext }) {
    const g = StoryAudioR2Pather.slug(genre);
    const id = StoryAudioR2Pather.slug(musicId);
    const e = String(ext ?? '').replace(/^\.+/, '').toLowerCase() || 'm4a';
    return `${StoryAudioR2Pather.PREFIX}/${g}/${id}.${e}`;
  }

  static catalogKey() {
    return `${StoryAudioR2Pather.PREFIX}/catalog.json`;
  }
}

module.exports = { StoryAudioR2Pather };
