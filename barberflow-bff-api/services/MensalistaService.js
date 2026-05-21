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
   * @param {number|string|null|undefined} [monthlyFee=0]
   */
  async adicionar(userId, barbershopId, clientId, monthlyFee = 0) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);
    const mensalidade = this.#normalizarMensalidade(monthlyFee);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.adicionar(barbershopId, clientId, mensalidade);
  }

  /**
   * Normaliza valor monetario opcional do plano mensal.
   * @param {number|string|null|undefined} valor
   * @returns {number}
   */
  #normalizarMensalidade(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0 || num > 999999.99) {
      throw AppError.badRequest("Campo 'monthly_fee' deve ser um valor entre 0 e 999999.99.");
    }
    return Math.round(num * 100) / 100;
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
   * Verifica se um cliente é mensalista ativo e retorna dados do plano.
   * NÃO exige ownership — qualquer usuário autenticado pode consultar.
   * @param {string} barbershopId
   * @param {string} clientId
   * @returns {Promise<{ativo:boolean, monthly_fee:number, haircuts_count:number}>}
   */
  async verificar(barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);
    const row = await this.#repo.verificar(barbershopId, clientId);
    return row
      ? { ativo: true,  monthly_fee: row.monthly_fee,    haircuts_count: row.haircuts_count }
      : { ativo: false, monthly_fee: 0, haircuts_count: 0 };
  }

  /**
   * Incrementa em 1 o contador de cortes do mensalista ativo.
   * NÃO exige ownership — qualquer profissional autenticado pode chamar.
   * @param {string} barbershopId
   * @param {string} clientId
   */
  async incrementarCortes(barbershopId, clientId) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('client_id',     clientId);
    await this.#repo.incrementarCortes(barbershopId, clientId);
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
   * Busca textual de perfis para adicionar como mensalista.
   * Requer ownership do `barbershopId` e termo `q` não vazio.
   * Sem termo, retorna lista vazia — a listagem automática deve
   * usar `listarFavoritosElegiveis`.
   *
   * @param {string} userId
   * @param {string} barbershopId
   * @param {string} q — termo de busca
   */
  async buscarClientesDisponiveis(userId, barbershopId, q) {
    this._uuid('barbershop_id', barbershopId);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.buscarClientesDisponiveis(barbershopId, q);
  }

  /**
   * Lista perfis elegíveis a se tornarem mensalistas: somente
   * usuários que favoritaram a barbearia ou qualquer barbeiro
   * vinculado a ela, excluindo mensalistas ativos.
   * Requer ownership do `barbershopId`.
   *
   * @param {string} userId
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarFavoritosElegiveis(userId, barbershopId) {
    this._uuid('barbershop_id', barbershopId);
    await this.#verificarOwnership(userId, barbershopId);
    return this.#repo.listarFavoritosElegiveis(barbershopId);
  }

  /**
   * Lista perfis que favoritaram a barbearia OU esse barbeiro específico.
   * Usado pela modal da cadeirinha. NÃO exige ownership — qualquer
   * profissional autenticado pode consultar.
   *
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async listarFavoritosModal(barbershopId, professionalId) {
    this._uuid('barbershop_id',   barbershopId);
    this._uuid('professional_id', professionalId);
    return this.#repo.listarFavoritosModal(barbershopId, professionalId);
  }
}

module.exports = MensalistaService;
