'use strict';

const { Result } = require('../../domain/shared/Result');

/**
 * BaseRepository — Implementação base para repositórios Supabase.
 *
 * Fornece helpers de mapeamento e tratamento de erros.
 * Subclasses implementam os métodos de acesso a dados específicos.
 *
 * @template TAggregate  Tipo do agregado gerenciado
 */
class BaseRepository {
  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #client;
  /** @type {string} */
  #tableName;

  /**
   * @param {{ supabaseClient: import('@supabase/supabase-js').SupabaseClient, tableName: string }} deps
   */
  constructor({ supabaseClient, tableName }) {
    if (!supabaseClient) throw new Error('BaseRepository: supabaseClient é obrigatório');
    if (!tableName)      throw new Error('BaseRepository: tableName é obrigatório');
    this.#client    = supabaseClient;
    this.#tableName = tableName;
  }

  /** @protected */
  get _client() { return this.#client; }

  /** @protected */
  get _table() { return this.#tableName; }

  /**
   * Envolve operações Supabase em Result, normalizando erros.
   * @protected
   * @template T
   * @param {() => Promise<{ data: T, error: import('@supabase/supabase-js').PostgrestError|null }>} fn
   * @returns {Promise<Result<T, string>>}
   */
  async _run(fn) {
    try {
      const { data, error } = await fn();
      if (error) return Result.fail(error.message ?? 'Erro desconhecido no banco de dados');
      return Result.ok(data);
    } catch (err) {
      return Result.fail(err?.message ?? 'Erro inesperado no repositório');
    }
  }

  /**
   * Busca um único registro por id.
   * @protected
   * @param {string} id
   * @returns {Promise<Result<object|null, string>>}
   */
  async _findOne(id) {
    return this._run(() =>
      this._client
        .from(this._table)
        .select('*')
        .eq('id', id)
        .maybeSingle(),
    );
  }

  /**
   * Upsert de um registro (insert or update by id).
   * @protected
   * @param {object} row  Objeto serializado (snake_case, sem métodos de domínio)
   * @returns {Promise<Result<object, string>>}
   */
  async _upsert(row) {
    return this._run(() =>
      this._client
        .from(this._table)
        .upsert(row, { onConflict: 'id' })
        .select()
        .single(),
    );
  }

  /**
   * Remove um registro por id.
   * @protected
   * @param {string} id
   * @returns {Promise<Result<void, string>>}
   */
  async _delete(id) {
    const result = await this._run(() =>
      this._client
        .from(this._table)
        .delete()
        .eq('id', id),
    );
    return result.isOk() ? Result.ok() : result;
  }

  /**
   * Converte um agregado de domínio para row de banco.
   * Deve ser sobrescrito pela subclasse.
   * @abstract
   * @param {TAggregate} aggregate
   * @returns {object}
   */
  _toRow(aggregate) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}._toRow() não implementado`);
  }

  /**
   * Converte um row de banco para agregado de domínio.
   * Deve ser sobrescrito pela subclasse.
   * @abstract
   * @param {object} row
   * @returns {import('../../domain/shared/Result').Result<TAggregate, string>}
   */
  _toDomain(row) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}._toDomain() não implementado`);
  }
}

module.exports = { BaseRepository };
