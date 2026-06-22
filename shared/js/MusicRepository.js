'use strict';

// =============================================================
// MusicRepository.js — store da REFERÊNCIA da música (4 campos).
//
// Persiste APENAS: music_id, music_name, music_duration, genre.
// NUNCA áudio (mp3/wav/blob/base64) nem URL. Valida e sanitiza na
// borda; rejeita URL externa / áudio remoto / upload / scripts.
//
// Reutiliza o StoryEditorService como store em memória (definirMusica/
// removerMusica/musica), apenas com a forma de referência.
// =============================================================

class MusicRepository {
  static GENEROS = [
    'Todos', 'Pop', 'Rock', 'Eletrônica', 'EDM', 'Funk', 'House', 'Trap',
    'HipHop', 'Clássica', 'Instrumental', 'Anime', 'LoFi', 'Chill', 'Tropical',
    'Jazz', 'Blues', 'Cinemática', 'Épica', 'Criativa',
  ];
  static MAX_DURATION = 600;      // 10 min
  static ID_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;
  static PERIGO_RE = /(https?:)?\/\/|data:|blob:|javascript:|script|[<>]/i;

  #service;

  /** @param {object} deps @param {object} deps.service — StoryEditorService */
  constructor({ service } = {}) {
    this.#service = service;
  }

  /**
   * Valida e sanitiza uma entrada para a referência canônica.
   * @returns {{ music_id, music_name, music_duration, genre }}
   * @throws {Error} se inválida/insegura
   */
  static validar(entrada = {}) {
    // Aceita tanto a faixa do catálogo quanto uma ref já no formato.
    const music_id = String(entrada.music_id ?? entrada.id ?? '').trim();
    const music_name = String(entrada.music_name ?? entrada.name ?? '').trim();
    const genre = String(entrada.genre ?? '').trim();
    const music_duration = Number(entrada.music_duration ?? entrada.duration);

    // Segurança: nenhum campo pode parecer URL/áudio remoto/script/upload.
    for (const v of [music_id, music_name, genre]) {
      if (MusicRepository.PERIGO_RE.test(v)) {
        throw new Error('Referência de música inválida: conteúdo não permitido (URL/áudio/script).');
      }
    }
    if (!MusicRepository.ID_RE.test(music_id)) {
      throw new Error('music_id inválido.');
    }
    if (!MusicRepository.GENEROS.includes(genre)) {
      throw new Error(`genre inválido: "${genre}".`);
    }
    if (!Number.isFinite(music_duration) || music_duration <= 0 || music_duration > MusicRepository.MAX_DURATION) {
      throw new Error('music_duration inválida.');
    }

    return {
      music_id,
      music_name: MusicRepository.#sanitizarNome(music_name),
      music_duration: Math.round(music_duration),
      genre,
    };
  }

  /** Valida/sanitiza e grava SÓ a referência. Retorna a ref salva. */
  salvar(entrada) {
    const ref = MusicRepository.validar(entrada);
    this.#service?.definirMusica(ref);
    return ref;
  }

  /** Referência atual (4 campos) ou null. */
  obter() {
    const m = this.#service?.musica ?? null;
    if (!m) return null;
    return {
      music_id: m.music_id ?? null,
      music_name: m.music_name ?? '',
      music_duration: m.music_duration ?? 0,
      genre: m.genre ?? null,
    };
  }

  limpar() { this.#service?.removerMusica?.(); }

  // Mantém imprimíveis (espaços/acentos); remove control chars. Sem regex
  // de range p/ evitar ambiguidade de bytes; PERIGO_RE já barrou < >.
  static #sanitizarNome(nome) {
    let out = '';
    for (const ch of String(nome)) {
      const code = ch.codePointAt(0);
      if (code >= 32 && code !== 127) out += ch;
    }
    return out.slice(0, 120).trim();
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicRepository };
}
