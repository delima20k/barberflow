'use strict';

// =============================================================
// ProfissionalService.js — Regras de negócio de profissionais.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ProfissionalRepository.
// =============================================================

const Profissional = require('../entities/Profissional');
const BaseService  = require('../infra/BaseService');

class ProfissionalService extends BaseService {

  #profissionalRepository;

  /** @param {import('../repositories/ProfissionalRepository')} profissionalRepository */
  constructor(profissionalRepository) {
    super('ProfissionalService');
    this.#profissionalRepository = profissionalRepository;
  }

  /**
   * Busca um profissional pelo ID de perfil.
   * @param {string} id
   * @returns {Promise<Profissional>}
   */
  async buscarProfissional(id) {
    this._uuid('id', id);

    const row = await this.#profissionalRepository.getById(id);
    if (!row) throw this._erro('Profissional não encontrado.', 404);

    return Profissional.fromRow(row);
  }

  /**
   * Lista profissionais de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<Profissional[]>}
   */
  async listarPorBarbearia(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    const rows = await this.#profissionalRepository.getByBarbershop(barbershopId);
    return rows.map(r => Profissional.fromRow(r));
  }

  /**
   * Lista cadeiras de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarCadeiras(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    return this.#profissionalRepository.getCadeiras(barbershopId);
  }

  /**
   * Retorna as imagens do portfólio de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async listarPortfolio(professionalId) {
    this._uuid('professionalId', professionalId);
    return this.#profissionalRepository.getPortfolio(professionalId);
  }

  /**
   * Adiciona imagem ao portfólio.
   * @param {string} professionalId
   * @param {object} dados — { image_url, thumbnail_path?, caption? }
   * @returns {Promise<object>}
   */
  async adicionarPortfolioImagem(professionalId, dados) {
    this._uuid('professionalId', professionalId);

    if (!dados?.image_url?.trim())
      throw this._erro('image_url é obrigatório.');

    if (typeof dados.caption === 'string') {
      dados.caption = this._texto('caption', dados.caption, 300);
    }

    return this.#profissionalRepository.addPortfolioImage(professionalId, dados);
  }

  /**
   * Remove imagem do portfólio.
   * @param {string} imageId
   * @param {string} professionalId
   * @returns {Promise<boolean>}
   */
  async removerPortfolioImagem(imageId, professionalId) {
    this._uuid('imageId', imageId);
    this._uuid('professionalId', professionalId);
    return this.#profissionalRepository.removePortfolioImage(imageId, professionalId);
  }
}

module.exports = ProfissionalService;
