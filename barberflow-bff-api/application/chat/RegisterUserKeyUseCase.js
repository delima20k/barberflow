'use strict';

const { Result } = require('../../domain/shared/Result');

class RegisterUserKeyUseCase {
  #userKeyRepository;

  constructor({ userKeyRepository }) {
    if (!userKeyRepository) throw new TypeError('RegisterUserKeyUseCase requer userKeyRepository.');
    this.#userKeyRepository = userKeyRepository;
  }

  async execute({ userId, publicKey }) {
    if (!userId || !publicKey) return Result.fail('userId e publicKey obrigatorios.');
    if (typeof publicKey !== 'string' || publicKey.length < 50 || publicKey.length > 2048) {
      return Result.fail('publicKey invalida: deve ser base64 SPKI ECDH P-256 (50–2048 chars).');
    }
    await this.#userKeyRepository.upsert(userId, publicKey);
    return Result.ok({ userId });
  }
}

module.exports = { RegisterUserKeyUseCase };
