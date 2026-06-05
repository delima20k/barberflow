'use strict';

const { UserKeyRepository } = require('../../domain/chat/ports/UserKeyRepository');

class SupabaseUserKeyRepository extends UserKeyRepository {
  #db;

  constructor(db) {
    super();
    if (!db) throw new TypeError('SupabaseUserKeyRepository.db obrigatorio.');
    this.#db = db;
  }

  async findByUserId(userId) {
    const { data, error } = await this.#db
      .from('user_keys')
      .select('user_id, public_key')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw this.#error(error);
    if (!data) return null;
    return { userId: data.user_id, publicKey: data.public_key };
  }

  async upsert(userId, publicKey) {
    const { error } = await this.#db
      .from('user_keys')
      .upsert(
        { user_id: userId, public_key: publicKey },
        { onConflict: 'user_id' },
      );
    if (error) throw this.#error(error);
  }

  #error(error) {
    return Object.assign(new Error(error.message), { code: error.code });
  }
}

module.exports = { SupabaseUserKeyRepository };
