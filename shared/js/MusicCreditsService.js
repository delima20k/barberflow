'use strict';

// =============================================================
// MusicCreditsService.js — gera texto visual de creditos de musica.
//
// Usa somente metadados ja presentes no item do catalogo. Nunca busca API,
// nunca acessa DOM e nunca persiste audio/URL. A saida deve ser renderizada
// com textContent pelo componente visual.
// =============================================================

class MusicCreditsService {
  static MAX_FIELD = 180;
  static MAX_TEXT = 900;

  #cache = new Map();

  generate(metadata = {}) {
    const rawArtist = metadata.artist;
    const rawTitle = metadata.title ?? metadata.music_name;
    const artist = this.sanitize(rawArtist);
    const title = this.sanitize(rawTitle);
    if (!artist || !title) return null;

    const cacheKey = this.#cacheKey({ ...metadata, artist, title });
    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;

    const footer = this.buildFooter({ title: rawTitle, artist: rawArtist });
    this.#cache.set(cacheKey, footer);
    return footer;
  }

  sanitize(text) {
    let out = '';
    for (const ch of String(text ?? '')) {
      const code = ch.codePointAt(0);
      if (code >= 32 && code !== 127) out += ch;
    }
    return out
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
      .slice(0, MusicCreditsService.MAX_FIELD)
      .trim();
  }

  buildFooter({ title, artist } = {}) {
    const safeTitle = this.sanitize(title);
    const safeArtist = this.sanitize(artist);
    if (!safeTitle || !safeArtist) return null;

    return [
      '\uD83C\uDFB5 M\u00FAsica utilizada neste conte\u00FAdo:',
      '',
      `"${safeTitle}"`,
      '',
      'Autor/Artista:',
      safeArtist,
      '',
      '\u00A9 Todos os direitos reservados ao respectivo criador.',
      '',
      'Este conte\u00FAdo utiliza \u00E1udio licenciado ou atribu\u00EDdo ao autor original conforme disponibilidade da plataforma.',
    ].join('\n').slice(0, MusicCreditsService.MAX_TEXT);
  }

  #cacheKey(track) {
    const id = String(track?.id ?? '').trim();
    if (id) return id;
    return `${track.artist ?? ''}::${track.title ?? track.music_name ?? ''}`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicCreditsService };
}
