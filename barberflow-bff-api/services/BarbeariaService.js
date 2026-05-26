'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

/**
 * BarbeariaService — Regras de negócio para barbearias no BFF.
 *
 * Aplica filtro Haversine sobre bounding-box retornado pelo repository.
 * Ordena resultados por distância.
 *
 * Camada: application
 */
class BarbeariaService extends BaseService {

  /** @type {import('../repositories/BarbeariaRepository')} */
  #repo;

  /** @param {import('../repositories/BarbeariaRepository')} repo */
  constructor(repo) {
    super('BarbeariaService');
    this.#repo = repo;
  }

  // ── Listagens ────────────────────────────────────────────────────

  /**
   * Lista barbearias próximas via PostGIS ST_DWithin (banco filtra e ordena).
   * Requer: migration 20260517000001_postgis_barbershops.sql aplicada.
   * @param {number} lat
   * @param {number} lng
   * @param {number} [raioKm=5]
   * @returns {Promise<object[]>}
   */
  async listarProximas(lat, lng, raioKm = 5) {
    this._coordenada(lat, lng);
    BarbeariaService.#validarRaio(raioKm);

    try {
      const rows = await this.#repo.getNearby(lat, lng, raioKm);
      return rows.map(row => ({
        ...row,
        distancia_km: row.distancia_m != null ? row.distancia_m / 1000 : null,
      }));
    } catch (err) {
      throw AppError.unavailable('Serviço de localização de barbearias temporariamente indisponível.');
    }
  }

  /**
   * Lista barbearias em destaque (top rated).
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async listarDestaque(limit = 6) {
    BarbeariaService.#validarLimit(limit);
    try {
      return await this.#repo.getFeatured(limit);
    } catch (err) {
      throw AppError.unavailable('Serviço de barbearias em destaque temporariamente indisponível.');
    }
  }

  /**
   * Lista todas as barbearias ativas por popularidade.
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  async listarTodas(limit = 60) {
    BarbeariaService.#validarLimit(limit);
    try {
      return await this.#repo.getAll(limit);
    } catch (err) {
      throw AppError.unavailable('Serviço de barbearias temporariamente indisponível.');
    }
  }

  /**
   * Salva endereco completo e coordenadas da barbearia do usuario autenticado.
   * @param {string} userId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async salvarEndereco(userId, dados = {}) {
    this._uuid('userId', userId);

    const lat = Number(dados.lat);
    const lng = Number(dados.lng);
    this._coordenada(lat, lng);

    const rua = this._texto('address', dados.address, 160, true);
    const numero = this._texto('numero', dados.numero ?? '', 30, false);
    const complemento = this._texto('complemento', dados.complemento ?? '', 80, false);
    const city = this._texto('city', dados.city ?? '', 80, false);
    const state = this._texto('state', dados.state ?? '', 2, false).toUpperCase();
    const zipCode = this._texto('zip_code', dados.zip_code ?? dados.zipCode ?? '', 12, false);
    const neighborhood = this._texto('neighborhood', dados.neighborhood ?? '', 80, false);
    const address = [rua, numero, complemento].filter(Boolean).join(', ');

    return this.#repo.updateEndereco(userId, {
      address,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      neighborhood: neighborhood || null,
      latitude: lat,
      longitude: lng,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Busca barbeiros elegíveis para convite da barbearia autenticada.
   * @param {string} userId
   * @param {string} busca
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async buscarBarbeirosDisponiveis(userId, busca, limit) {
    this._uuid('userId', userId);
    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');
    return this.#repo.buscarBarbeirosDisponiveis(shop.id, userId, busca, limit);
  }

  /**
   * Envia convites em massa para barbeiros selecionados.
   * @param {string} userId
   * @param {object} dados
   * @returns {Promise<{enviados: number}>}
   */
  async enviarConvites(userId, dados = {}) {
    this._uuid('userId', userId);

    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');

    const { professional_ids: rawIds = [], proposal = {} } = dados;
    if (!Array.isArray(rawIds) || !rawIds.length) {
      throw AppError.badRequest('professional_ids é obrigatório e deve ter ao menos 1 item.');
    }
    rawIds.forEach(id => this._uuid('professional_ids[]', id));

    const temPct  = proposal.commission_percentage != null;
    const temRent = proposal.chair_rent_amount     != null;
    if (!temPct && !temRent) {
      throw AppError.badRequest('Informe commission_percentage ou chair_rent_amount.');
    }
    const valor = temPct ? Number(proposal.commission_percentage) : Number(proposal.chair_rent_amount);
    if (!isFinite(valor) || valor <= 0) {
      throw AppError.badRequest('Valor da proposta inválido.');
    }
    if (temPct && valor > 99) {
      throw AppError.badRequest('Porcentagem máxima é 99%.');
    }

    const tipoLabel = temPct ? '[% dos Cortes]' : '[Aluguel de Cadeira]';
    const notas     = this._texto('notes', String(proposal.notes ?? ''), 500, false);
    const message   = notas ? `${tipoLabel} ${notas}` : tipoLabel;

    const enviados = await this.#repo.enviarConvites(shop.id, rawIds, valor, message);
    return { enviados };
  }

  /**
   * Retorna equipe ativa + convites pendentes/recusados da barbearia do owner.
   * @param {string} userId
   * @returns {Promise<{aceitos: object[], convites: object[]}>}
   */
  async getEquipeComStatus(userId) {
    this._uuid('userId', userId);
    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');
    return this.#repo.getEquipeComStatus(shop.id);
  }

  /**
   * Dispensa barbeiro da barbearia do owner.
   * @param {string} userId
   * @param {string} professionalId
   * @returns {Promise<{dispensado: true}>}
   */
  async dispensarBarbeiro(userId, professionalId) {
    this._uuid('userId', userId);
    this._uuid('professionalId', professionalId);
    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');
    return this.#repo.dispensarBarbeiro(shop.id, professionalId);
  }

  /**
   * Cancela convite pendente da barbearia do owner.
   * @param {string} userId
   * @param {string} inviteId
   * @returns {Promise<{cancelado: true}>}
   */
  async cancelarConvite(userId, inviteId) {
    this._uuid('userId', userId);
    this._uuid('inviteId', inviteId);
    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');
    return this.#repo.cancelarConvite(shop.id, inviteId);
  }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Valida raio em km. Lança AppError(400) se inválido.
   * @param {number} raioKm
   */
  static #validarRaio(raioKm) {
    if (typeof raioKm !== 'number' || !isFinite(raioKm) || raioKm <= 0 || raioKm > 100) {
      throw AppError.badRequest('raio deve ser um número entre 0 e 100 km.');
    }
  }

  /**
   * Valida limit de resultados. Lança AppError(400) se inválido.
   * @param {number} limit
   */
  static #validarLimit(limit) {
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw AppError.badRequest('limit deve ser um inteiro entre 1 e 100.');
    }
  }
}

module.exports = BarbeariaService;
