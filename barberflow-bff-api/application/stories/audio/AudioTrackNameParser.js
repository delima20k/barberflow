'use strict';

/**
 * AudioTrackNameParser — extrai nome/artista/título de um nome de arquivo de
 * áudio, limpando sufixos de provedor e índices de duplicata.
 *
 * Exemplos:
 *   "Aeris - Andromeda (freetouse.com).mp3"      → { artist:'Aeris', title:'Andromeda', name:'Aeris - Andromeda' }
 *   "Aeris - Andromeda (freetouse.com) (1).mp3"  → idem (índice (1) removido)
 *   "Bad Ideas Distressed - Kevin MacLeod.mp3"   → { artist:'Bad Ideas Distressed', title:'Kevin MacLeod', name:'Bad Ideas Distressed - Kevin MacLeod' }
 *
 * Puro — sem I/O, totalmente testável.
 * Camada: application
 */
class AudioTrackNameParser {
  /** Provedores/sufixos parentéticos a remover do fim do nome. */
  static PROVIDER_RE = /\s*\((?:freetouse\.com|freetouse|no copyright music|ncs|audionautix)\)\s*$/i;
  /** Índice de duplicata no fim: " (1)", " (2)"… */
  static DUP_INDEX_RE = /\s*\(\d+\)\s*$/;

  /**
   * @param {string} filename — nome do arquivo (com ou sem extensão/caminho)
   * @returns {{ artist: string, title: string, name: string }}
   */
  static parse(filename) {
    const base = AudioTrackNameParser.#baseSemExtensao(String(filename ?? ''));
    let nome = base;

    // Remove índice de duplicata e sufixo de provedor (pode haver os dois).
    nome = nome.replace(AudioTrackNameParser.DUP_INDEX_RE, '');
    nome = nome.replace(AudioTrackNameParser.PROVIDER_RE, '');
    nome = nome.replace(AudioTrackNameParser.DUP_INDEX_RE, '');
    nome = nome.replace(/\s+/g, ' ').trim();

    const segs = nome.split(' - ').map(s => s.trim()).filter(Boolean);
    let artist = '';
    let title = nome;
    if (segs.length >= 2) {
      artist = segs[0];
      title = segs.slice(1).join(' - ');
    }

    return { artist, title, name: nome };
  }

  static #baseSemExtensao(filename) {
    // Tira diretórios (qualquer separador) e a extensão final.
    const semDir = filename.split(/[\\/]/).pop() ?? filename;
    const dot = semDir.lastIndexOf('.');
    return dot > 0 ? semDir.slice(0, dot) : semDir;
  }
}

module.exports = { AudioTrackNameParser };
