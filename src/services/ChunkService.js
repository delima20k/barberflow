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
//   - HashService (SHA-256) por chunk — integridade granular
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
// Dependências: HashService (SHA-256 — integridade por chunk)
// =============================================================

const HashService = require('./HashService');

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

  /** @type {HashService} */
  #hashService;

  /**
   * @param {number}      [chunkSizeBytes=1048576] — Tamanho máximo de cada chunk em bytes (padrão: 1 MB)
   * @param {HashService} [hashService]            — Dependência de integridade (injetável para testes)
   */
  constructor(chunkSizeBytes = DEFAULT_CHUNK_BYTES, hashService = new HashService()) {
    if (!Number.isInteger(chunkSizeBytes) || chunkSizeBytes < 1) {
      throw new RangeError('[ChunkService] chunkSizeBytes deve ser um inteiro positivo');
    }
    this.#chunkSize    = chunkSizeBytes;
    this.#hashService  = hashService;
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
        hash: this.#hashService.generateHash(slice),
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
      this.#verificarHash(chunk);
    }

    return Buffer.concat(sorted.map(c => c.data));
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════════

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
   * Delega validação de hash ao HashService.
   * Lança se o hash não bater — adulteração detectada; descarta imediatamente.
   * @param {Chunk} chunk
   */
  #verificarHash(chunk) {
    try {
      this.#hashService.validateHash(chunk.data, chunk.hash);
    } catch {
      throw new Error(`[ChunkService] hash mismatch no chunk ${chunk.index} — adulteração detectada`);
    }
  }
}

module.exports = ChunkService;
