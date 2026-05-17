'use strict';

const BaseValidator  = require('../validators/BaseValidator');
const AppError       = require('../utils/AppError');
const { logger }     = require('../middlewares/logger');

/**
 * BaseRepository — Classe base para repositórios do BFF.
 *
 * Fornece helpers de validação e acesso ao cliente Supabase,
 * eliminando boilerplate repetitivo em cada repositório.
 *
 * Uso:
 *   class AgendamentoRepository extends BaseRepository {
 *     constructor(db) { super('AgendamentoRepository', db); }
 *
 *     async getById(id) {
 *       this._uuid('id', id);
 *       const { data, error } = await this._db.from('agendamentos')
 *         .select('*').eq('id', id).single();
 *       if (error) this._throwDbError(error, 'getById');
 *       return data;
 *     }
 *   }
 */
class BaseRepository {

  /** @type {string} */
  #nome;

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /**
   * @param {string}                                         nome — nome da subclasse
   * @param {import('@supabase/supabase-js').SupabaseClient} db   — cliente Supabase
   */
  constructor(nome, db) {
    this.#nome = nome;
    this.#db   = db;
  }

  // ── Acesso protegido ─────────────────────────────────────────────

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  get _db()   { return this.#db; }

  /** @type {string} */
  get _nome() { return this.#nome; }

  // ── Validadores ──────────────────────────────────────────────────

  /**
   * Valida UUID. Lança AppError(400) se inválido.
   * @param {string} campo
   * @param {string} valor
   */
  _uuid(campo, valor) {
    BaseValidator.uuid(`[${this.#nome}] ${campo}`, valor);
  }

  /**
   * Valida e-mail. Lança AppError(400) se inválido.
   * @param {string} valor
   */
  _email(valor) {
    BaseValidator.email(`[${this.#nome}] email`, valor);
  }

  /**
   * Filtra payload contra allowlist (previne mass assignment).
   * @param {object}   dados
   * @param {string[]} camposPermitidos
   * @returns {object} payload sanitizado
   */
  _payload(dados, camposPermitidos) {
    return BaseValidator.payload(dados, camposPermitidos);
  }

  /**
   * Valida e sanitiza texto livre.
   * @param {string}  campo
   * @param {string}  valor
   * @param {number}  [maxLen=500]
   * @param {boolean} [obrig=false]
   * @returns {string} valor sanitizado
   */
  _texto(campo, valor, maxLen = 500, obrig = false) {
    return BaseValidator.texto(`[${this.#nome}] ${campo}`, valor, maxLen, obrig);
  }

  /**
   * Valida coordenadas geográficas.
   * @param {number} lat
   * @param {number} lng
   */
  _coordenada(lat, lng) {
    BaseValidator.coordenada(lat, lng);
  }

  // ── Helper de erro de banco ──────────────────────────────────────

  /**
   * Lança AppError(500) com mensagem segura.
   * Nunca expõe detalhes internos do banco ao cliente.
   * @param {object} error    — erro retornado pelo Supabase (nunca exposto ao cliente)
   * @param {string} [ctx=''] — contexto para a mensagem interna
   * @throws {AppError}
   */
  _throwDbError(error, ctx = '') {
    logger.error({ repo: this.#nome, op: ctx, err: error }, '[BFF] erro de banco');
    const msg = ctx
      ? `[${this.#nome}] ${ctx}: falha no banco de dados.`
      : `[${this.#nome}] falha no banco de dados.`;
    throw AppError.internal(msg);
  }

  /**
   * Loga aviso não-fatal (ex: fallback de serviço degradado).
   * Não lança exceção — uso exclusivo para degradação controlada.
   * @param {string} ctx   — contexto da operação
   * @param {object} error — erro original (nunca exposto ao cliente)
   */
  _warn(ctx, error) {
    logger.warn({ repo: this.#nome, op: ctx, err: error }, '[BFF] fallback ativado');
  }
}

module.exports = BaseRepository;
