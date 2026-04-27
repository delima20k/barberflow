'use strict';

// =============================================================
// PasswordService.js — Hashing e validação de senhas com bcrypt.
// Camada: infra
//
// Responsabilidade única: operações criptográficas sobre senhas.
//   - NUNCA armazena senhas em texto puro.
//   - NUNCA retorna a senha original.
//   - Valida força antes de qualquer operação.
//
// Uso:
//   const { ok, msg } = PasswordService.validarForca(senha);
//   const hash        = await PasswordService.hash(senha);
//   const ok          = await PasswordService.verificar(senha, hash);
//
// Para acelerar testes: process.env.BCRYPT_ROUNDS = '4'
// Produção usa 12 rounds (padrão OWASP).
// =============================================================

const bcrypt = require('bcryptjs');

class PasswordService {

  static #MIN_LENGTH  = 8;
  static #MAX_LENGTH  = 128;

  // Exige pelo menos: 1 minúscula + 1 maiúscula + 1 dígito
  static #FORCA_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

  /**
   * Lê o número de rounds em tempo de chamada (não de carregamento),
   * permitindo que testes sobrescrevam BCRYPT_ROUNDS sem reimportar o módulo.
   * @returns {number}
   */
  static #saltRounds() {
    return Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '12', 10));
  }

  // ── Validação ─────────────────────────────────────────────

  /**
   * Valida a força da senha. Retorna { ok, msg }.
   * Não faz I/O — pode ser chamado de forma síncrona.
   *
   * @param {string} senha
   * @returns {{ ok: boolean, msg: string }}
   */
  static validarForca(senha) {
    if (!senha || typeof senha !== 'string') {
      return { ok: false, msg: 'Senha obrigatória.' };
    }
    if (senha.length < PasswordService.#MIN_LENGTH) {
      return { ok: false, msg: `Senha deve ter no mínimo ${PasswordService.#MIN_LENGTH} caracteres.` };
    }
    if (senha.length > PasswordService.#MAX_LENGTH) {
      return { ok: false, msg: 'Senha muito longa.' };
    }
    if (!PasswordService.#FORCA_REGEX.test(senha)) {
      return { ok: false, msg: 'Senha deve conter letras maiúsculas, minúsculas e números.' };
    }
    return { ok: true, msg: '' };
  }

  // ── Hash ──────────────────────────────────────────────────

  /**
   * Gera hash bcrypt da senha em texto puro.
   * Cada chamada produz hash diferente (salt aleatório por design).
   *
   * @param {string} senha — texto puro
   * @returns {Promise<string>} hash bcrypt (60 chars)
   * @throws {Error} se senha vazia
   */
  static async hash(senha) {
    if (!senha || typeof senha !== 'string') throw new Error('Senha não pode ser vazia.');
    return bcrypt.hash(senha, PasswordService.#saltRounds());
  }

  // ── Verificação ───────────────────────────────────────────

  /**
   * Verifica se uma senha em texto puro coincide com o hash armazenado.
   * Tempo constante — resistente a timing attacks (garantido pelo bcrypt).
   *
   * @param {string} senha          — texto puro fornecido pelo usuário
   * @param {string} hashArmazenado — hash bcrypt do banco de dados
   * @returns {Promise<boolean>}
   */
  static async verificar(senha, hashArmazenado) {
    if (!senha || !hashArmazenado) return false;
    return bcrypt.compare(senha, hashArmazenado);
  }
}

module.exports = PasswordService;
