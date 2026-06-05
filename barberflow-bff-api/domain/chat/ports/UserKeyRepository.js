'use strict';

class UserKeyRepository {
  async findByUserId(_userId) { throw new Error('UserKeyRepository.findByUserId nao implementado.'); }
  async upsert(_userId, _publicKey) { throw new Error('UserKeyRepository.upsert nao implementado.'); }
}

module.exports = { UserKeyRepository };
