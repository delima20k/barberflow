'use strict';

const { GenreClassifier } = require('./GenreClassifier');

/**
 * StoryAudioCatalogBuilder — monta o JSON do catálogo de áudios de story a
 * partir das faixas processadas. NÃO inclui caminhos locais (só url pública R2).
 *
 * Formato:
 * {
 *   generatedAt, count,
 *   genres: ["Todos", ...generos com faixas],
 *   tracks: [{ music_id, music_name, artist, duration, genre, size, url, ext }]
 * }
 *
 * Puro — sem I/O, totalmente testável.
 * Camada: application
 */
class StoryAudioCatalogBuilder {
  /**
   * @param {Array<object>} tracks — faixas com { music_id, music_name, artist,
   *   duration, genre, size, url, ext }
   * @param {{ now?: () => Date }} [opts]
   * @returns {object} catálogo serializável
   */
  static montar(tracks = [], { now = () => new Date() } = {}) {
    const limpas = (Array.isArray(tracks) ? tracks : [])
      .filter(t => t && t.music_id && t.url)
      .map(t => StoryAudioCatalogBuilder.#normalizar(t));

    // Gêneros presentes, na ordem oficial, prefixados por "Todos".
    const presentes = new Set(limpas.map(t => t.genre));
    const genres = ['Todos', ...GenreClassifier.GENEROS.filter(g => presentes.has(g))];

    return {
      generatedAt: now().toISOString(),
      count: limpas.length,
      genres,
      tracks: limpas,
    };
  }

  static #normalizar(t) {
    return {
      music_id: String(t.music_id),
      music_name: String(t.music_name ?? ''),
      artist: String(t.artist ?? ''),
      duration: Number(t.duration) || 0,
      genre: GenreClassifier.GENEROS.includes(t.genre) ? t.genre : GenreClassifier.DEFAULT,
      size: Number(t.size) || 0,
      url: String(t.url),
      ext: String(t.ext ?? '').replace(/^\.+/, '').toLowerCase() || 'm4a',
    };
  }
}

module.exports = { StoryAudioCatalogBuilder };
