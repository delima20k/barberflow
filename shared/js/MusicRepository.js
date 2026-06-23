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
    const genre_raw = String(entrada.genre ?? '').trim();
    const music_duration = Number(entrada.music_duration ?? entrada.duration);

    // Segurança: nenhum campo pode parecer URL/áudio remoto/script/upload. SEMPRE throw.
    for (const v of [music_id, music_name, genre_raw]) {
      if (MusicRepository.PERIGO_RE.test(v)) {
        throw new Error('Referência de música inválida: conteúdo não permitido (URL/áudio/script).');
      }
    }

    // ID: normaliza para lowercase + hífens em vez de rejeitar — catálogos externos podem
    // usar formatos variados (UUID, slug, inteiro). Rejeita somente se o resultado for vazio.
    const idNorm = music_id.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80);
    if (!idNorm) throw new Error('music_id inválido: vazio.');

    // Gênero: se o catálogo retornar um gênero fora da lista canônica, usa 'Todos' como
    // fallback para não bloquear a seleção da música na UI.
    const genre = MusicRepository.GENEROS.includes(genre_raw) ? genre_raw : 'Todos';

    // Duração: fallback de 30 s quando ausente/inválida (não bloqueia).
    const duration = Number.isFinite(music_duration) && music_duration > 0 && music_duration <= MusicRepository.MAX_DURATION
      ? Math.round(music_duration) : 30;

    return {
      music_id: idNorm,
      music_name: MusicRepository.#sanitizarNome(music_name),
      music_duration: duration,
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
