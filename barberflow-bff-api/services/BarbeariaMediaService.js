'use strict';

const crypto      = require('node:crypto');
const sharp       = require('sharp');
const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');
const { logger }  = require('../middlewares/logger');

/**
 * BarbeariaMediaService — upload e processamento de midias da barbearia.
 *
 * Mantem regra de negocio na BFF: valida imagem, confirma ownership,
 * processa para WebP e delega persistencia ao repository.
 */
class BarbeariaMediaService extends BaseService {

  static #TIPOS = Object.freeze({
    logo:  { campo: 'logo_path',  nome: 'logo.webp',  width: 256,  height: 256, fit: 'contain', quality: 80, minQuality: 60, targetBytes: 5 * 1024 },
    cover: { campo: 'cover_path', nome: 'cover.webp', width: 1280, height: null, fit: 'inside' },
  });

  static #SERVICO_CFG = Object.freeze({ width: 900, height: null, fit: 'inside' });

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

    const shop = await this.#repo.getPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia nao encontrada.');

    const buffer = await BarbeariaMediaService.#processarImagem(arquivo, cfg);
    const path = `${shop.id}/${cfg.nome}`;
    const pathAntigo = shop[cfg.campo] ?? null;
    const updatedAt = new Date().toISOString();

    await this.#repo.uploadImagemBarbearia(path, buffer, 'image/webp');
    await this.#repo.updateImagem(shop.id, cfg.campo, path, updatedAt);
    await this.#removerImagemAntiga(pathAntigo, path);
    await this.#removerVariantesAntigas(shop.id, cfg.nome);

    return {
      path,
      publicUrl: this.#repo.getBarbershopPublicUrl(path),
      updated_at: updatedAt,
    };
  }

  async #removerImagemAntiga(pathAntigo, pathNovo) {
    if (!pathAntigo || pathAntigo === pathNovo) return;
    if (typeof this.#repo.removerImagemBarbearia !== 'function') return;

    try {
      await this.#repo.removerImagemBarbearia(pathAntigo);
    } catch (error) {
      logger.warn({ service: this._nomeSvc, op: 'removerImagemAntiga', err: error }, '[BFF] limpeza de imagem antiga falhou');
    }
  }

  async #removerVariantesAntigas(shopId, arquivoAtual) {
    if (typeof this.#repo.removerVariantesImagemBarbearia !== 'function') return;

    try {
      await this.#repo.removerVariantesImagemBarbearia(shopId, arquivoAtual);
    } catch (error) {
      logger.warn({ service: this._nomeSvc, op: 'removerVariantesAntigas', err: error }, '[BFF] limpeza de variantes antigas falhou');
    }
  }

  /**
   * Processa imagem de servico/produto da barbearia via BFF.
   * A persistencia do item continua no fluxo da tela; aqui ficam validacao,
   * compressao e Storage.
   * @param {string} userId
   * @param {Buffer} arquivo
   * @param {string} mime
   * @returns {Promise<{path:string, publicUrl:string, updated_at:string}>}
   */
  async salvarImagemServico(userId, arquivo, mime) {
    this._uuid('userId', userId);
    BarbeariaMediaService.#validarEntrada(arquivo, mime);

    const shop = await this.#repo.getPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia nao encontrada.');

    const buffer = await BarbeariaMediaService.#processarImagem(arquivo, BarbeariaMediaService.#SERVICO_CFG);
    const path = `${shop.id}/services/${crypto.randomUUID()}.webp`;
    const updatedAt = new Date().toISOString();

    await this.#repo.uploadImagemBarbearia(path, buffer, 'image/webp');

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
      let quality = cfg.quality ?? 82;
      const minQuality = cfg.minQuality ?? quality;
      let buffer = await img.clone().resize(resize).webp({ quality, effort: 4 }).toBuffer();
      while (cfg.targetBytes && buffer.length > cfg.targetBytes && quality > minQuality) {
        quality = Math.max(minQuality, quality - 5);
        buffer = await img.clone().resize(resize).webp({ quality, effort: 4 }).toBuffer();
      }
      return buffer;
    } catch {
      throw AppError.badRequest('Arquivo de imagem invalido.');
    }
  }
}

module.exports = BarbeariaMediaService;
