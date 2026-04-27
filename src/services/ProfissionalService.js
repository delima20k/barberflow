'use strict';

// =============================================================
// ProfissionalService.js — Regras de negócio de profissionais.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao ProfissionalRepository.
// =============================================================

const Profissional   = require('../entities/Profissional');
const InputValidator = require('../infra/InputValidator');

class ProfissionalService {

  #profissionalRepository;

  /** @param {import('../repositories/ProfissionalRepository')} profissionalRepository */
  constructor(profissionalRepository) {
    this.#profissionalRepository = profissionalRepository;
  }

  /**
   * Busca um profissional pelo ID de perfil.
   * @param {string} id
   * @returns {Promise<Profissional>}
   */
  async buscarProfissional(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const row = await this.#profissionalRepository.getById(id);
    if (!row) throw Object.assign(new Error('Profissional não encontrado.'), { status: 404 });

    return Profissional.fromRow(row);
  }

  /**
   * Lista profissionais de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<Profissional[]>}
   */
  async listarPorBarbearia(barbershopId) {
    const rId = InputValidator.uuid(barbershopId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const rows = await this.#profissionalRepository.getByBarbershop(barbershopId);
    return rows.map(r => Profissional.fromRow(r));
  }

  /**
   * Lista cadeiras de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarCadeiras(barbershopId) {
    const rId = InputValidator.uuid(barbershopId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#profissionalRepository.getCadeiras(barbershopId);
  }

  /**
   * Retorna as imagens do portfólio de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async listarPortfolio(professionalId) {
    const rId = InputValidator.uuid(professionalId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#profissionalRepository.getPortfolio(professionalId);
  }

  /**
   * Adiciona imagem ao portfólio.
   * @param {string} professionalId
   * @param {object} dados — { image_url, thumbnail_path?, caption? }
   * @returns {Promise<object>}
   */
  async adicionarPortfolioImagem(professionalId, dados) {
    const rId = InputValidator.uuid(professionalId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    if (!dados?.image_url?.trim())
      throw Object.assign(new Error('image_url é obrigatório.'), { status: 400 });

    if (typeof dados.caption === 'string') {
      const rCap = InputValidator.textoLivre(dados.caption, 300);
      if (!rCap.ok) throw Object.assign(new Error(`caption: ${rCap.msg}`), { status: 400 });
      dados.caption = rCap.valor;
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
    const rImg = InputValidator.uuid(imageId);
    const rPro = InputValidator.uuid(professionalId);
    if (!rImg.ok) throw Object.assign(new Error(rImg.msg), { status: 400 });
    if (!rPro.ok) throw Object.assign(new Error(rPro.msg), { status: 400 });

    return this.#profissionalRepository.removePortfolioImage(imageId, professionalId);
  }
}

module.exports = ProfissionalService;
