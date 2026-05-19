'use strict';

// =============================================================
// HashService.js — Geração e validação de hashes SHA-256.
// Camada: application
//
// RESPONSABILIDADE ÚNICA:
//   Centraliza todas as operações de integridade SHA-256 do sistema.
//   Substitui cálculos inline espalhados pelo codebase (DRY).
//
// PROPRIEDADES DE SEGURANÇA:
//   - SHA-256: resistente a colisões para dados arbitrários
//   - validateHash() usa crypto.timingSafeEqual → anti timing-attack
//     (impede inferir partes do hash correto pelo tempo de resposta)
//   - Falha imediata (throw) em caso de mismatch — sem retorno silencioso
//
// USO:
//   const hashSvc = new HashService();
//
//   // Gerar hash de um buffer (ex: chunk de ciphertext):
//   const hash = hashSvc.generateHash(buffer); // → '3a7bd3e2...' (64 hex chars)
//
//   // Validar integridade antes de processar:
//   hashSvc.validateHash(buffer, hash); // lança se mismatch
//
//   // Verificação booleana (sem exceção):
//   const ok = hashSvc.check(buffer, hash); // → true | false
//
// Dependências: node:crypto (nativa — zero dependências externas)
// =============================================================

const crypto = require('node:crypto');

// SHA-256 hex produz sempre 64 caracteres (256 bits / 4 bits por char hex)
const SHA256_HEX_LENGTH = 64;

class HashService {

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Calcula o hash SHA-256 de um buffer e retorna em hex (64 chars).
   *
   * @param {Buffer} buffer — Dados a ser hasheados
   * @returns {string} SHA-256 hex digest (64 chars lowercase)
   * @throws {TypeError} se buffer não for um Buffer
   */
  generateHash(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('[HashService] generateHash: buffer deve ser um Buffer');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Valida a integridade de um buffer comparando com o hash esperado.
   * Lança erro imediatamente se houver mismatch (fail-fast).
   * Usa timingSafeEqual para evitar timing-attacks.
   *
   * @param {Buffer} buffer   — Dados a validar
   * @param {string} expected — Hash SHA-256 hex esperado (64 chars)
   * @throws {TypeError} se buffer não for Buffer ou expected não for string
   * @throws {Error}     se o hash não bater (adulteração detectada)
   */
  validateHash(buffer, expected) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('[HashService] validateHash: buffer deve ser um Buffer');
    }
    if (typeof expected !== 'string') {
      throw new TypeError('[HashService] validateHash: expected deve ser uma string hex');
    }

    if (!this.check(buffer, expected)) {
      throw new Error('[HashService] hash mismatch — adulteração detectada; buffer descartado');
    }
  }

  /**
   * Verifica a integridade de um buffer sem lançar exceção.
   * Retorna false silenciosamente em caso de mismatch.
   * Usa timingSafeEqual → anti timing-attack.
   *
   * Use validateHash() quando quiser falha imediata (recomendado para segurança).
   * Use check() quando precisar de controle de fluxo (ex: logging antes de descartar).
   *
   * @param {Buffer} buffer   — Dados a verificar
   * @param {string} expected — Hash SHA-256 hex esperado
   * @returns {boolean}
   */
  check(buffer, expected) {
    if (!Buffer.isBuffer(buffer) || typeof expected !== 'string') return false;

    const computed   = this.generateHash(buffer);
    const bufComp    = Buffer.from(computed);

    // Pad para evitar que timingSafeEqual lance por tamanhos diferentes
    const normalised = expected.toLowerCase().padEnd(SHA256_HEX_LENGTH, '\0');
    const bufExp     = Buffer.from(normalised);

    if (bufComp.length !== bufExp.length) return false;

    return crypto.timingSafeEqual(bufComp, bufExp);
  }
}

module.exports = HashService;
