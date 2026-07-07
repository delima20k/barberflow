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
    cover: { campo: 'cover_path', nome: 'cover.webp', width: 1280, height: null, fit: 'inside', quality: 82, minQuality: 60, targetBytes: 30 * 1024, maxBytes: 40 * 1024, minWidth: 384 },
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

  /**
   * Salva o card de convite (PNG 1080×1080 gerado no canvas) no Supabase Storage.
   * Não faz conversão nem atualiza o DB — só persiste o arquivo.
   * @param {string} userId
   * @param {Buffer} arquivo
   * @returns {Promise<{path:string, publicUrl:string}>}
   */
  async salvarOgCard(userId, arquivo, barbershopId = null) {
    this._uuid('userId', userId);
    if (barbershopId) this._uuid('barbershopId', barbershopId);
    if (!Buffer.isBuffer(arquivo) || arquivo.length === 0) throw AppError.badRequest('Arquivo inválido.');
    if (arquivo.length > BarbeariaMediaService.#MAX_BYTES) throw AppError.badRequest('Arquivo excede 5 MB.');

    // Aceita PNG/JPEG/WebP (o cliente comprime o canvas para WebP no upload via
    // ImageCompressionService). O og:image precisa ser JPEG/PNG — o WhatsApp NÃO
    // renderiza WebP e ignora previews grandes (~>600 KB, que era o caso do PNG
    // do canvas). Por isso reencodamos SEMPRE para JPEG comprimido (~100-150 KB).
    const isPng  = arquivo[0] === 0x89 && arquivo[1] === 0x50;             // ‰P
    const isJpeg = arquivo[0] === 0xFF && arquivo[1] === 0xD8;             // FF D8
    const isWebp = arquivo.length > 11
      && arquivo[0] === 0x52 && arquivo[1] === 0x49                        // RI (RIFF)
      && arquivo[8] === 0x57 && arquivo[9] === 0x45;                       // WE (WEBP)
    if (!isPng && !isJpeg && !isWebp) throw AppError.badRequest('Formato inválido (PNG, JPEG ou WebP).');

    const shop = typeof this.#repo.getParaOgCard === 'function'
      ? await this.#repo.getParaOgCard(userId, barbershopId)
      : await this.#repo.getPorOwner(userId);
    if (!shop?.id) throw AppError.notFound('Barbearia não encontrada.');

    // Guarda o card como JPEG quadrado comprimido (~70KB). A composição em
    // PAISAGEM 1200×630 (banner que o WhatsApp mostra grande) é feita na hora de
    // servir (rota /b/:id?img=1), então qualquer card já existente é aproveitado.
    let jpg;
    try {
      jpg = await sharp(arquivo, { failOn: 'none' })
        .resize(1080, 1080, { fit: 'cover' })
        .flatten({ background: '#0d0d0d' })          // card é opaco; remove alpha p/ JPEG
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw AppError.badRequest('Arquivo de imagem inválido.');
    }

    const path = `${shop.id}/og-card.jpg`;
    await this.#repo.uploadImagemBarbearia(path, jpg, 'image/jpeg');

    return { path, publicUrl: this.#repo.getBarbershopPublicUrl(path) };
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
      let quality = cfg.quality ?? 82;
      const minQuality = cfg.minQuality ?? quality;
      let width = cfg.width;
      let buffer = await BarbeariaMediaService.#renderizarWebp(img, cfg, width, quality);

      while (cfg.targetBytes && buffer.length > cfg.targetBytes && quality > minQuality) {
        quality = Math.max(minQuality, quality - 5);
        buffer = await BarbeariaMediaService.#renderizarWebp(img, cfg, width, quality);
      }

      while (cfg.maxBytes && buffer.length > cfg.maxBytes && cfg.minWidth && width > cfg.minWidth) {
        width = Math.max(cfg.minWidth, Math.floor(width * 0.9));
        buffer = await BarbeariaMediaService.#renderizarWebp(img, cfg, width, minQuality);
      }

      return buffer;
    } catch {
      throw AppError.badRequest('Arquivo de imagem invalido.');
    }
  }

  static #renderizarWebp(img, cfg, width, quality) {
    const resize = cfg.height
      ? { width: cfg.width, height: cfg.height, fit: cfg.fit, position: 'centre' }
      : { width, withoutEnlargement: true, fit: cfg.fit };

    return img.clone().resize(resize).webp({ quality, effort: 4 }).toBuffer();
  }
}

module.exports = BarbeariaMediaService;
