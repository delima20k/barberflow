'use strict';

/**
 * GenreClassifier — pré-classifica uma faixa em um gênero da UI a partir de
 * palavras-chave no artista/título. Heurística (revisável pelo humano depois).
 *
 * Default: 'Instrumental' (a maioria do acervo freetouse é instrumental).
 * Puro — sem I/O, totalmente testável.
 * Camada: application
 */
class GenreClassifier {
  /** Gêneros exibidos na modal (ordem de exibição; 'Todos' é só filtro). */
  static GENEROS = [
    'Pop', 'Rock', 'Eletrônica', 'EDM', 'Funk', 'House', 'Trap', 'HipHop',
    'Clássica', 'Instrumental', 'Anime', 'LoFi', 'Chill', 'Tropical',
    'Jazz', 'Blues', 'Cinemática', 'Épica', 'Criativa',
  ];

  static DEFAULT = 'Instrumental';

  // Ordem importa: o primeiro match vence (do mais específico ao mais genérico).
  static #REGRAS = [
    ['Anime',      [/\banime\b/, /\botaku\b/, /\bjpop\b/]],
    ['LoFi',       [/\blo-?fi\b/, /\bchillhop\b/, /\bstudy\b/]],
    ['Trap',       [/\btrap\b/, /\b808\b/, /\bdrill\b/]],
    ['HipHop',     [/\bhip ?hop\b/, /\brap\b/, /\bboom ?bap\b/]],
    ['EDM',        [/\bedm\b/, /\bfestival\b/, /\bdrop\b/, /\bbass\b/, /\bdubstep\b/]],
    ['House',      [/\bhouse\b/, /\bdeep house\b/, /\bgroove\b/]],
    ['Funk',       [/\bfunk\b/, /\bfunky\b/, /\bdisco\b/]],
    ['Tropical',   [/\btropical\b/, /\bukulele\b/, /\bsummer\b/, /\bbeach\b/, /\bisland/, /\breggae\b/]],
    ['Jazz',       [/\bjazz\b/, /\bswing\b/, /\bsax\b/]],
    ['Blues',      [/\bblues\b/, /\bsoul\b/]],
    ['Clássica',   [/\bclassic(al)?\b/, /\bpiano\b/, /\borchestra/, /\bstring quartet\b/]],
    ['Épica',      [/\bepic\b/, /\bglory\b/, /\bbattle\b/, /\bhero/, /\bwar\b/, /\bvalor\b/, /\bsteel\b/]],
    ['Cinemática', [/\bcinematic\b/, /\btrailer\b/, /\bambient\b/, /\bemotional\b/, /\bdramatic\b/]],
    ['Rock',       [/\brock\b/, /\bguitar\b/, /\bmetal\b/, /\bpunk\b/, /\bgrunge\b/]],
    ['Eletrônica', [/\belectro/, /\bsynth/, /\bneon\b/, /\bcyber/, /\bfuture\b/, /\bwave\b/, /\btechno\b/]],
    ['Chill',      [/\bchill\b/, /\brelax/, /\bcalm\b/, /\bdream/, /\bsleep\b/, /\bcozy\b/]],
    ['Pop',        [/\bpop\b/, /\blove\b/, /\bhappy\b/, /\bjoy\b/, /\bparty\b/, /\bdance\b/, /\bfeel good\b/]],
  ];

  /**
   * @param {{ artist?: string, title?: string }} faixa
   * @returns {string} gênero
   */
  static classificar({ artist = '', title = '' } = {}) {
    const texto = `${artist} ${title}`.toLowerCase();
    for (const [genero, regras] of GenreClassifier.#REGRAS) {
      if (regras.some(re => re.test(texto))) return genero;
    }
    return GenreClassifier.DEFAULT;
  }
}

module.exports = { GenreClassifier };
