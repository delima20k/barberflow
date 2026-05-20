'use strict';

const sharp       = require('sharp');
const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

/**
 * BarbeariaMediaService — upload e processamento de midias da barbearia.
 *
 * Mantem regra de negocio na BFF: valida imagem, confirma ownership,
 * processa para WebP e delega persistencia ao repository.
 */
class BarbeariaMediaService extends BaseService {

  static #TIPOS = Object.freeze({
    logo:  { campo: 'logo_path',  nome: 'logo.webp',  width: 256,  height: 256, fit: 'cover' },
    cover: { campo: 'cover_path', nome: 'cover.webp', width: 1280, height: null, fit: 'inside' },
  });

  static #MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  static #MAX_BYTES = 5 * 1024 * 1024;

  /** @type {import('../repositories/BarbeariaRepository')} */
  #repo;

  /** @param {import('../repositories/BarbeariaRepository')} repo */
  constructor(repo) {
    super('BarbeariaMediaService');
    this.#repo = repo;
  }

  /**
   * Processa e salva logo/capa da barbearia do usuario autenticado.
   * @param {string} userId
   * @param {'logo'|'cover'} tipo
   * @param {Buffer} arquivo
   * @param {string} mime
   * @returns {Promise<{path:string, publicUrl:string, updated_at:string}>}
   */
  async salvarImagem(userId, tipo, arquivo, mime) {
    this._uuid('userId', userId);
    const cfg = BarbeariaMediaService.#TIPOS[tipo];
    if (!cfg) throw AppError.badRequest("Query 'tipo' deve ser 'logo' ou 'cover'.");
    BarbeariaMediaService.#validarEntrada(arquivo, mime);

    const shop = await this.#repo.getAtivaPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia ativa nao encontrada.');

    const buffer = await BarbeariaMediaService.#processarImagem(arquivo, cfg);
    const path = `${shop.id}/${cfg.nome}`;
    const updatedAt = new Date().toISOString();

    await this.#repo.uploadImagemBarbearia(path, buffer, 'image/webp');
    await this.#repo.updateImagem(userId, cfg.campo, path, updatedAt);

    return {
      path,
      publicUrl: this.#repo.getBarbershopPublicUrl(path),
      updated_at: updatedAt,
    };
  }

  static #validarEntrada(arquivo, mime) {
    if (!Buffer.isBuffer(arquivo) || arquivo.length === 0) {
      throw AppError.badRequest('Imagem obrigatoria.');
    }
    if (arquivo.length > BarbeariaMediaService.#MAX_BYTES) {
      throw AppError.badRequest('Imagem excede o tamanho maximo de 5MB.');
    }
    if (!BarbeariaMediaService.#MIMES.has(String(mime || '').toLowerCase())) {
      throw AppError.badRequest('Formato de imagem invalido.');
    }
  }

  static async #processarImagem(arquivo, cfg) {
    try {
      const img = sharp(arquivo, { failOn: 'warning' }).rotate();
      const resize = cfg.height
        ? { width: cfg.width, height: cfg.height, fit: cfg.fit, position: 'centre' }
        : { width: cfg.width, withoutEnlargement: true, fit: cfg.fit };
      return await img.resize(resize).webp({ quality: 82, effort: 4 }).toBuffer();
    } catch {
      throw AppError.badRequest('Arquivo de imagem invalido.');
    }
  }
}

module.exports = BarbeariaMediaService;
