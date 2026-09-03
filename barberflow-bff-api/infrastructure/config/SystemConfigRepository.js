'use strict';

// ============================================================
// SystemConfigRepository — leitura e escrita de configurações
// de sistema criptografadas na tabela `system_config`.
//
// Acesso exclusivo via service_role (a tabela não possui
// policies públicas de RLS).
//
// Uso:
//   const repo = new SystemConfigRepository(supabase, encryption);
//   await repo.set('r2.account_id', 'abc123');
//   const val  = await repo.get('r2.account_id'); // 'abc123'
// ============================================================

class SystemConfigRepository {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /** @type {import('./ConfigEncryptionService').ConfigEncryptionService} */
  #encryption;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {import('./ConfigEncryptionService').ConfigEncryptionService} encryption
   */
  constructor(supabase, encryption) {
    if (!supabase)   throw new TypeError('SystemConfigRepository: supabase é obrigatório.');
    if (!encryption) throw new TypeError('SystemConfigRepository: encryption é obrigatório.');
    // Guard explícito: se algo que não é um client Supabase de verdade chegar
    // aqui, falha com uma mensagem diagnosticável na hora, em vez de um
    // "X.from is not a function" genérico lá na hora do uso (ver getAll/get/set).
    if (typeof supabase.from !== 'function') {
      throw new TypeError(
        `SystemConfigRepository: supabase inválido — esperava um client com .from(), recebeu ${typeof supabase} (constructor: ${supabase?.constructor?.name ?? 'desconhecido'}).`,
      );
    }
    this.#db         = supabase;
    this.#encryption = encryption;
  }

  /**
   * Persiste ou atualiza um valor criptografado.
   * @param {string} key
   * @param {string} plainValue
   * @returns {Promise<void>}
   */
  async set(key, plainValue) {
    this.#validarKey(key);
    const { valueEnc, iv, authTag } = this.#encryption.encrypt(String(plainValue));

    const { error } = await this.#db
      .from('system_config')
      .upsert(
        { key, value_enc: valueEnc, iv, auth_tag: authTag },
        { onConflict: 'key' },
      );

    if (error) throw new Error(`[SystemConfigRepository.set] ${error.message}`);
  }

  /**
   * Lê e decripta um valor. Retorna null se não existir.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    this.#validarKey(key);

    const { data, error } = await this.#db
      .from('system_config')
      .select('value_enc, iv, auth_tag')
      .eq('key', key)
      .maybeSingle();

    if (error) throw new Error(`[SystemConfigRepository.get] ${error.message}`);
    if (!data)  return null;

    return this.#encryption.decrypt({
      valueEnc: data.value_enc,
      iv:       data.iv,
      authTag:  data.auth_tag,
    });
  }

  /**
   * Lê e decripta múltiplas chaves de uma vez.
   * Chaves inexistentes são omitidas do Map retornado.
   * @param {string[]} keys
   * @returns {Promise<Map<string, string>>}
   */
  async getAll(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return new Map();

    const { data, error } = await this.#db
      .from('system_config')
      .select('key, value_enc, iv, auth_tag')
      .in('key', keys);

    if (error) throw new Error(`[SystemConfigRepository.getAll] ${error.message}`);

    const result = new Map();
    for (const row of (data ?? [])) {
      try {
        result.set(row.key, this.#encryption.decrypt({
          valueEnc: row.value_enc,
          iv:       row.iv,
          authTag:  row.auth_tag,
        }));
      } catch {
        // Registro corrompido ou chave trocada — ignora silenciosamente
      }
    }
    return result;
  }

  /**
   * Remove uma chave do banco (uso administrativo).
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    this.#validarKey(key);
    const { error } = await this.#db
      .from('system_config')
      .delete()
      .eq('key', key);
    if (error) throw new Error(`[SystemConfigRepository.delete] ${error.message}`);
  }

  // ── Privado ───────────────────────────────────────────────

  #validarKey(key) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new TypeError('[SystemConfigRepository] key deve ser string não vazia.');
    }
  }
}

module.exports = { SystemConfigRepository };
