'use strict';

// =============================================================
// ChunkService.js — Divisão e reconstrução de buffers em chunks
// Camada: application
//
// FINALIDADE:
//   Divide buffers (normalmente ciphertext do EncryptionService)
//   em pedaços menores com hash SHA-256 por chunk.
//   Antes de reconstruir, valida cada hash — qualquer adulteração
//   é detectada e a operação é abortada com erro explícito.
//
// PROPRIEDADES DE SEGURANÇA:
//   - Hash SHA-256 por chunk (integridade granular)
//   - timingSafeEqual na comparação de hashes (anti timing-attack)
//   - Reordenação automática por índice antes do merge
//   - Merge falha loudly (não silencia adulterações)
//   - Índices validados para detectar gaps ou duplicatas
//
// USO TÍPICO com EncryptionService:
//   const enc    = encSvc.encrypt(fileBuffer);    // plaintext → ciphertext
//   const chunks = chunkSvc.split(enc.data);      // ciphertext → chunks
//   // ... distribuir chunks individualmente ...
//   const merged = chunkSvc.merge(chunks);        // chunks → ciphertext
//   const plain  = encSvc.decrypt({ ...enc, data: merged }); // ciphertext → plaintext
//
// Tamanho padrão: 1 MB por chunk (ajustável no construtor).
//
// Dependências: node:crypto (nativa — zero dependências externas)
// =============================================================

const crypto = require('node:crypto');

const DEFAULT_CHUNK_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * @typedef {Object} Chunk
 * @property {number} index — Índice zero-based do chunk na sequência original
 * @property {Buffer} data  — Dados do chunk
 * @property {string} hash  — SHA-256 hex de data (64 chars)
 */

class ChunkService {

  /** @type {number} */
  #chunkSize;

  /**
   * @param {number} [chunkSizeBytes=1048576] — Tamanho máximo de cada chunk em bytes (padrão: 1 MB)
   */
  constructor(chunkSizeBytes = DEFAULT_CHUNK_BYTES) {
    if (!Number.isInteger(chunkSizeBytes) || chunkSizeBytes < 1) {
      throw new RangeError('[ChunkService] chunkSizeBytes deve ser um inteiro positivo');
    }
    this.#chunkSize = chunkSizeBytes;
  }

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Divide um buffer em chunks sequenciais, cada um com hash SHA-256.
   * Buffer vazio retorna array vazio.
   *
   * @param {Buffer} buffer
   * @returns {Chunk[]}
   * @throws {TypeError} se buffer não for um Buffer
   */
  split(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('[ChunkService] split: buffer deve ser um Buffer');
    }

    if (buffer.length === 0) return [];

    const chunks = [];

    for (let offset = 0, index = 0; offset < buffer.length; offset += this.#chunkSize, index++) {
      const slice = buffer.subarray(offset, offset + this.#chunkSize);
      chunks.push({
        index,
        data: slice,
        hash: ChunkService.#sha256Hex(slice),
      });
    }

    return chunks;
  }

  /**
   * Valida o hash SHA-256 de cada chunk e reconstrói o buffer original.
   * Qualquer adulteração (dado ou hash) lança um erro imediatamente.
   * Chunks são reordenados por índice antes do merge.
   *
   * @param {Chunk[]} chunks
   * @returns {Buffer}
   * @throws {TypeError}  se chunks não for um array
   * @throws {RangeError} se houver índices duplicados ou gaps na sequência
   * @throws {Error}      se o hash de qualquer chunk não bater (adulteração)
   */
  merge(chunks) {
    if (!Array.isArray(chunks)) {
      throw new TypeError('[ChunkService] merge: chunks deve ser um array');
    }

    if (chunks.length === 0) return Buffer.alloc(0);

    const sorted = [...chunks].sort((a, b) => a.index - b.index);

    ChunkService.#validarSequencia(sorted);

    for (const chunk of sorted) {
      ChunkService.#verificarHash(chunk);
    }

    return Buffer.concat(sorted.map(c => c.data));
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════════

  /**
   * Calcula SHA-256 de um buffer e retorna em hex (64 chars).
   * @param {Buffer} buf
   * @returns {string}
   */
  static #sha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Garante que índices formam uma sequência contígua começando em 0.
   * Detecta gaps (chunk perdido) e duplicatas.
   * @param {Chunk[]} sortedChunks — já ordenados por index
   */
  static #validarSequencia(sortedChunks) {
    for (let i = 0; i < sortedChunks.length; i++) {
      if (sortedChunks[i].index !== i) {
        throw new RangeError(
          `[ChunkService] merge: sequência de índices inválida — esperado ${i}, recebido ${sortedChunks[i].index}`
        );
      }
    }
  }

  /**
   * Verifica o hash SHA-256 de um chunk usando comparação timing-safe.
   * @param {Chunk} chunk
   * @throws {Error} se o hash não bater
   */
  static #verificarHash(chunk) {
    const computed = ChunkService.#sha256Hex(chunk.data);
    const expected = typeof chunk.hash === 'string' ? chunk.hash : '';

    // timingSafeEqual requer buffers do mesmo tamanho
    // SHA-256 hex é sempre 64 chars → buffers sempre iguais
    const bufComputed = Buffer.from(computed);
    const bufExpected = Buffer.from(expected.padEnd(computed.length, '\0'));

    const valido = bufExpected.length === bufComputed.length &&
                   crypto.timingSafeEqual(bufComputed, bufExpected);

    if (!valido) {
      throw new Error(`[ChunkService] hash mismatch no chunk ${chunk.index} — adulteração detectada`);
    }
  }
}

module.exports = ChunkService;
