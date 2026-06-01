'use strict';

// =============================================================
// MessageModerationService.js — Camada: application
//
// Filtro client-side de conteúdo ofensivo (PT-BR).
// Mirror leve do ContentModerationService da BFF.
// Fornece feedback instantâneo; o BFF é a porta autoritativa.
//
// Reutilizável em ambos os apps (cliente e profissional).
// =============================================================

class MessageModerationService {

  // Lista de termos proibidos (normalizada: minúsculas, sem acentos)
  static #BLOCKLIST = new Set([
    'puta', 'puto', 'vadia', 'vagabunda', 'vagabundo',
    'viado', 'bicha', 'merda', 'bosta', 'caralho',
    'foda', 'foder', 'fodase', 'desgraçado', 'desgraçada',
    'otario', 'otaria', 'arrombado', 'arrombada',
    'buceta', 'porra', 'cuzao', 'cuzão',
    'idiota', 'imbecil', 'retardado', 'retardada',
    'crackudo', 'drogado', 'drogada', 'lixo', 'inutil',
    'inútil', 'canalha', 'safado', 'safada',
  ]);

  // Padrões que indicam conteúdo não permitido
  static #PADROES = [
    { regex: /https?:\/\//i,                           motivo: 'conteudo_nao_permitido' },
    { regex: /www\.[a-z0-9-]+\.[a-z]{2,}/i,            motivo: 'conteudo_nao_permitido' },
    { regex: /\b\d{2}\s?\d{4,5}[\s-]?\d{4}\b/,         motivo: 'conteudo_nao_permitido' }, // telefone
    { regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,          motivo: 'conteudo_nao_permitido' }, // CPF
    { regex: /(.)\1{6,}/,                               motivo: 'conteudo_nao_permitido' }, // repetição abusiva
    { regex: /^[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{10,}$/,           motivo: 'conteudo_nao_permitido' }, // CAPSLOCK
  ];

  /**
   * Verifica se o texto contém conteúdo ofensivo ou não permitido.
   * @param {string} texto
   * @returns {{ bloqueado: boolean, motivo?: 'conteudo_ofensivo'|'conteudo_nao_permitido' }}
   */
  static verificar(texto) {
    if (!texto || typeof texto !== 'string') return { bloqueado: false };

    const normalizado = MessageModerationService.#normalizar(texto);

    // Verifica blocklist de palavras (correspondência exata de palavra)
    for (const termo of MessageModerationService.#BLOCKLIST) {
      const re = new RegExp(`\\b${termo}\\b`, 'i');
      if (re.test(normalizado)) {
        return { bloqueado: true, motivo: 'conteudo_ofensivo' };
      }
    }

    // Verifica padrões gerais
    for (const { regex, motivo } of MessageModerationService.#PADROES) {
      if (regex.test(texto)) {
        return { bloqueado: true, motivo };
      }
    }

    return { bloqueado: false };
  }

  /** Remove acentos para comparação normalizada. */
  static #normalizar(texto) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
}
