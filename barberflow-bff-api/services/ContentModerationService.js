'use strict';

// =============================================================
// ContentModerationService.js — Moderação de conteúdo textual
//
// Responsabilidades:
//   - Bloquear mensagens com palavras ofensivas (PT-BR)
//   - Bloquear padrões de spam, links externos, conteúdo abusivo
//   - Retornar { bloqueado, motivo } sem lançar exceção
//
// Camada: application (BFF only)
// =============================================================

const BLOCKLIST = new Set([
  'puta', 'puto', 'vadia', 'vagabunda', 'vagabundo',
  'viado', 'bicha', 'sapatao', 'gay', 'traveco',
  'negao', 'macaco', 'macaca',
  'idiota', 'imbecil', 'retardado', 'mongoloide',
  'cu', 'buceta', 'xoxota', 'rola', 'pau', 'pinto',
  'merda', 'bosta', 'cagar', 'caralho',
  'foda', 'foder', 'fodase', 'foda-se',
  'desgraçado', 'desgraça', 'otario', 'otário',
  'corno', 'cornudo', 'chifruda',
  'piranha', 'prostituta',
  'matar', 'morte', 'morrer',
  'crack', 'cocaina', 'maconha', 'drogas',
]);

// Normaliza para comparação: minúsculas, sem acento, sem hifens
const normalizar = (str) =>
  String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]/g, '');

// Regex de padrões estruturalmente suspeitos (links, telefones, CPF)
const PADROES_BLOQUEADOS = [
  /https?:\/\//i,                          // links externos
  /www\./i,                                 // links sem protocolo
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,        // CPF
  /\b\d{2}\s?\d{4,5}[\s-]?\d{4}\b/,       // telefone
  /(.)\1{6,}/,                              // repetição excessiva de char (aaaaaaa)
];

class ContentModerationService {

  /**
   * Verifica se o texto deve ser bloqueado.
   * @param {string} texto
   * @returns {{ bloqueado: boolean, motivo?: string }}
   */
  static verificar(texto) {
    if (typeof texto !== 'string' || !texto.trim()) {
      return { bloqueado: false };
    }

    const textoNorm = normalizar(texto);

    // Verifica cada palavra do texto
    const palavras = textoNorm.split(/\s+/);
    for (const palavra of palavras) {
      const limpa = palavra.replace(/[^a-z]/g, '');
      if (BLOCKLIST.has(limpa)) {
        return { bloqueado: true, motivo: 'conteudo_ofensivo' };
      }
      // Verifica se a palavra contém algum termo do blocklist como substring
      for (const termo of BLOCKLIST) {
        if (limpa.length >= termo.length && limpa.includes(termo)) {
          return { bloqueado: true, motivo: 'conteudo_ofensivo' };
        }
      }
    }

    // Verifica padrões estruturais
    for (const padrao of PADROES_BLOQUEADOS) {
      if (padrao.test(texto)) {
        return { bloqueado: true, motivo: 'conteudo_nao_permitido' };
      }
    }

    // Todo texto em maiúsculas (grito) com mais de 10 chars = spam visual
    const semEspacos = texto.replace(/\s/g, '');
    if (semEspacos.length > 10 && semEspacos === semEspacos.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(semEspacos)) {
      return { bloqueado: true, motivo: 'conteudo_nao_permitido' };
    }

    return { bloqueado: false };
  }
}

module.exports = ContentModerationService;
