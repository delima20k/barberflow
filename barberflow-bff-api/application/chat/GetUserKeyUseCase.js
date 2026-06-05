'use strict';

const { Result } = require('../../domain/shared/Result');

class GetUserKeyUseCase {
  #userKeyRepository;

  constructor({ userKeyRepository }) {
    if (!userKeyRepository) throw new TypeError('GetUserKeyUseCase requer userKeyRepository.');
    this.#userKeyRepository = userKeyRepository;
  }

  async execute({ targetUserId }) {
    if (!targetUserId) return Result.fail('targetUserId obrigatorio.');
    const record = await this.#userKeyRepository.findByUserId(targetUserId);
    if (!record) return Result.fail('Chave pública não encontrada para este usuário.');
    return Result.ok({ publicKey: record.publicKey });
  }
}

module.exports = { GetUserKeyUseCase };
