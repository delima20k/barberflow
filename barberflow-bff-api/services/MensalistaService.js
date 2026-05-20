'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

/**
 * MensalistaService — Regras de negócio para mensalistas.
 *
 * Garante que apenas o dono da barbearia gerencia mensalistas (exceto `verificar`,
 * que qualquer usuário autenticado pode chamar).
 *
 * Camada: application
 */
class MensalistaService extends BaseService {

  /** @type {import('../repositories/MensalistaRepository')} */
  #repo;

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /**
   * @param {import('../repositories/MensalistaRepository')} repo
   * @param {import('@supabase/supabase-js').SupabaseClient}  db
   */
  constructor(repo, db) {
    super('MensalistaService');
    this.#repo = repo;
    this.#db   = db;
  }

  // ── Privados ──────────────────────────────────────────────────────

  /**
   * Lança 403 se `userId` não for dono da barbearia.
   * @param {string} userId
   * @param {string} barbershopId
   */
  async #verificarOwnership(userId, barbershopId) {
    const { data: shop } = await this.#db
      .from('barbershops')
      .select('owner_id')
      .eq('id', barbershopId)
      .maybeSingle();

    if (!shop || shop.owner_id !== userId) {
      throw AppError.forbidden('Acesso negado: você não é dono desta barbearia.');
    }
  }

  // ── Públicos ───────────────────────────────────────────────────────

  /**
   * Adiciona (ou renova) um cliente como mensalista.
   * Requer ownership do `barbershopId`.
   * @param {string} userId
   * @param {string} barbershopId
   * @param {string} clientId
   */
  async adicionar(userId, barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.adicionar(barbershopId, clientId);
  }

  /**
   * Lista mensalistas ativos de uma barbearia.
   * Requer ownership do `barbershopId`.
   * @param {string} userId
   * @param {string} barbershopId
   */
  async listar(userId, barbershopId) {
    this._uuid('barbershop_id', barbershopId);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.listar(barbershopId);
  }

  /**
   * Verifica se um cliente é mensalista ativo.
   * NÃO exige ownership — qualquer usuário autenticado pode consultar.
   * @param {string} barbershopId
   * @param {string} clientId
   * @returns {Promise<boolean>}
   */
  async verificar(barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);
    return this.#repo.verificar(barbershopId, clientId);
  }

  /**
   * Remove um mensalista.
   * Verifica ownership via `barbershop_id` da row.
   * @param {string} userId
   * @param {string} id   — ID da row na tabela `barbershop_mensalistas`
   */
  async remover(userId, id) {
    this._uuid('id', id);
    const row = await this.#repo.getById(id);
    if (!row) throw AppError.notFound('Mensalista não encontrado.');
    await this.#verificarOwnership(userId, row.barbershop_id);
    await this.#repo.remover(id);
  }

  /**
   * Busca perfis disponíveis para se tornarem mensalistas.
   * Requer ownership do `barbershopId`.
   * @param {string} userId
   * @param {string} barbershopId
   * @param {string} q — termo de busca
   */
  async buscarClientesDisponiveis(userId, barbershopId, q) {
    this._uuid('barbershop_id', barbershopId);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.buscarClientesDisponiveis(barbershopId, q);
  }
}

module.exports = MensalistaService;
