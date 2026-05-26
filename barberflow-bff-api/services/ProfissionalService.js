'use strict';

const crypto = require('node:crypto');
const sharp  = require('sharp');

const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');
const ProfissionalPublicProfileDto = require('../application/profissional/dto/ProfissionalPublicProfileDto');

const GENDERS = new Set(['masculino', 'feminino', 'outro', 'prefiro_nao_informar', 'nao_informar']);
const PORTFOLIO_CATEGORIES = new Set(['degrade', 'barba', 'social', 'freestyle', 'infantil', 'sobrancelha', 'antes_e_depois']);

const FOTOS_MIME_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FOTOS_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const FOTOS_MAX_QTD  = 10;

/**
 * ProfissionalService — Regras de negócio para o profissional/barbeiro.
 *
 * Valida entradas e delega ao repositório.
 *
 * Camada: application
 */
class ProfissionalService extends BaseService {

  /** @type {import('../repositories/ProfissionalRepository')} */
  #repo;
  #sendMessageUseCase;
  #deps;

  constructor(repo, sendMessageUseCase = null, deps = {}) {
    super('ProfissionalService');
    this.#repo = repo;
    this.#sendMessageUseCase = sendMessageUseCase;
    this.#deps = {
      now: () => new Date(),
      uuid: () => crypto.randomUUID(),
      ...deps,
    };
  }

  async buscarPerfilPublico(professionalId) {
    this._uuid('professionalId', professionalId);

    const row = await this.#repo.buscarPerfilPublico(professionalId);
    if (!row?.id && !row?.professional_id) {
      throw AppError.notFound('Profissional nao encontrado.');
    }

    return ProfissionalPublicProfileDto.fromRow(row);
  }

  async atualizarPerfilPublico(userId, dados = {}) {
    this._uuid('userId', userId);

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(dados, 'sinceYear')) {
      payload.since_year = this.#validarSinceYear(dados.sinceYear);
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'birthDate')) {
      payload.birth_date = this.#validarBirthDate(dados.birthDate);
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'gender')) {
      payload.gender = this.#validarGender(dados.gender);
    }

    if (Object.keys(payload).length === 0) {
      throw AppError.badRequest('Nenhum campo valido informado.');
    }

    await this.#repo.atualizarPerfilPublico(userId, payload);
    return ProfissionalPublicProfileDto.fromUpdate(payload);
  }

  async iniciarMensagemBarbearia(clienteId, professionalId) {
    this._uuid('clienteId', clienteId);
    this._uuid('professionalId', professionalId);
    if (!this.#sendMessageUseCase) {
      throw AppError.unavailable('Chat indisponivel.');
    }

    const ctx = await this.#repo.buscarContextoMensagem(professionalId);
    if (!ctx?.professional_id || !ctx?.owner_id || !ctx?.barbershop_id) {
      throw AppError.notFound('Vinculo ativo do profissional com barbearia nao encontrado.');
    }

    const metadata = {
      origin: 'barber_public_profile',
      professionalId,
      professionalName: ctx.professional_name ?? null,
      barbershopId: ctx.barbershop_id,
    };

    let conversationId = await this.#repo.encontrarConversaDireta(clienteId, ctx.owner_id, metadata);
    if (!conversationId) {
      conversationId = await this.#repo.criarConversaDireta({
        clientId: clienteId,
        ownerId: ctx.owner_id,
        createdBy: clienteId,
        metadata,
      });
    }

    const body = `Cliente interessado no barbeiro ${ctx.professional_name || professionalId}`;
    const result = await this.#sendMessageUseCase.execute({
      conversationId,
      senderId: clienteId,
      clientMessageId: this.#deps.uuid(),
      body,
      attachments: [],
    });

    if (result?.isFail?.()) {
      throw AppError.badRequest(String(result.getError()));
    }

    return {
      conversationId,
      message: result?.getValue?.() ?? null,
    };
  }

  async listarPortfolioPublico(professionalId, filtros = {}) {
    this._uuid('professionalId', professionalId);

    const limit = this.#normalizarLimit(filtros.limit);
    const offset = this.#normalizarOffset(filtros.offset);
    const result = await this.#repo.listarPortfolioPublico(professionalId, { limit, offset });

    return {
      items: (result?.items ?? []).map(row => ProfissionalService.#portfolioDto(row)),
      total: Number(result?.total ?? 0),
      limit,
      offset,
    };
  }

  async atualizarPortfolioImagem(userId, imageId, dados = {}) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(dados, 'title')) {
      payload.title = this._texto('title', dados.title ?? '', 80, false) || null;
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'description')) {
      payload.description = this._texto('description', dados.description ?? '', 240, false) || null;
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'category')) {
      payload.category = this.#validarPortfolioCategory(dados.category);
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'isFeatured')) {
      payload.is_featured = Boolean(dados.isFeatured);
    }

    if (Object.keys(payload).length === 0) {
      throw AppError.badRequest('Nenhum campo valido informado.');
    }

    const row = await this.#repo.atualizarPortfolioImagem(userId, imageId, payload);
    if (!row?.id) throw AppError.notFound('Imagem do portfolio nao encontrada.');
    return ProfissionalService.#portfolioDto(row);
  }

  async removerPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const result = await this.#repo.removerPortfolioImagem(userId, imageId);
    if (!result?.deleted) throw AppError.notFound('Imagem do portfolio nao encontrada.');

    if (result.storage_path) {
      await this.#repo.removerArquivoPortfolio(result.storage_path);
    }

    return { deleted: true };
  }

  async listarMeuPortfolio(userId, filtros = {}) {
    this._uuid('userId', userId);
    const limit  = this.#normalizarLimit(filtros.limit ?? 10);
    const offset = this.#normalizarOffset(filtros.offset ?? 0);
    const result = await this.#repo.listarMeuPortfolio(userId, { limit, offset });
    return {
      items: (result?.items ?? []).map(row => ProfissionalService.#portfolioDto(row)),
      total: Number(result?.total ?? 0),
    };
  }

  async uploadPortfolioImagem(userId, buffer, mimeHint) {
    this._uuid('userId', userId);

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw AppError.badRequest('Imagem obrigatoria.');
    }
    if (buffer.length > FOTOS_MAX_BYTES) {
      throw AppError.badRequest('Imagem excede o tamanho maximo de 8MB.');
    }

    const mime = ProfissionalService.#detectarMime(buffer);
    if (!mime) throw AppError.badRequest('Formato de imagem invalido. Envie JPEG, PNG ou WebP.');

    const total = await this.#repo.contarPortfolioImagens(userId);
    if (total >= FOTOS_MAX_QTD) {
      throw AppError.conflict(`Limite de ${FOTOS_MAX_QTD} fotos atingido.`);
    }

    const processarImagem = this.#deps.processarImagem ?? ProfissionalService.#processarImagem;
    const processado = await processarImagem(buffer);

    const path = `${userId}/fotos/${this.#deps.uuid()}.webp`;
    await this.#repo.uploadPortfolioImagem(path, processado, 'image/webp');
    const row = await this.#repo.salvarPortfolioImagem(userId, path, path);

    return {
      ...ProfissionalService.#portfolioDto(row),
      publicUrl: this.#repo.getPortfolioPublicUrl(path),
    };
  }

  // ── Convites ─────────────────────────────────────────────────────

  /**
   * Lista convites recebidos pelo profissional autenticado.
   * @param {string} profissionalId — derivado do JWT
   * @returns {Promise<object[]>}
   */
  async listarConvites(profissionalId) {
    this._uuid('profissionalId', profissionalId);
    return this.#repo.getConvites(profissionalId);
  }

  /**
   * Aceita convite: cria vínculo com barbearia e registra acordo financeiro.
   * @param {string} profissionalId — derivado do JWT
   * @param {string} inviteId
   * @returns {Promise<{aceito: true}>}
   */
  async aceitarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);
    return this.#repo.aceitarConvite(profissionalId, inviteId);
  }

  /**
   * Recusa convite: atualiza status sem criar vínculo.
   * @param {string} profissionalId — derivado do JWT
   * @param {string} inviteId
   * @returns {Promise<{recusado: true}>}
   */
  async recusarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);
    return this.#repo.recusarConvite(profissionalId, inviteId);
  }

  #validarSinceYear(valor) {
    if (valor === null || valor === '') return null;
    const year = Number(valor);
    const currentYear = this.#deps.now().getFullYear();
    if (!Number.isInteger(year) || year < 1950 || year > currentYear) {
      throw AppError.badRequest(`sinceYear deve ser um ano entre 1950 e ${currentYear}.`);
    }
    return year;
  }

  #validarBirthDate(valor) {
    if (valor === null || valor === '') return null;
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      throw AppError.badRequest('birthDate deve estar no formato YYYY-MM-DD.');
    }
    const date = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valor) {
      throw AppError.badRequest('birthDate invalida.');
    }
    return valor;
  }

  #validarGender(valor) {
    if (valor === null || valor === '') return null;
    if (typeof valor !== 'string' || !GENDERS.has(valor)) {
      throw AppError.badRequest('gender invalido.');
    }
    return valor;
  }

  #normalizarLimit(valor) {
    const limit = Number(valor ?? 12);
    if (!Number.isInteger(limit) || limit < 1 || limit > 48) {
      throw AppError.badRequest('limit deve ser um inteiro entre 1 e 48.');
    }
    return limit;
  }

  #normalizarOffset(valor) {
    const offset = Number(valor ?? 0);
    if (!Number.isInteger(offset) || offset < 0) {
      throw AppError.badRequest('offset deve ser um inteiro maior ou igual a 0.');
    }
    return offset;
  }

  #validarPortfolioCategory(valor) {
    if (valor === null || valor === '') return null;
    if (typeof valor !== 'string' || !PORTFOLIO_CATEGORIES.has(valor)) {
      throw AppError.badRequest('category invalida.');
    }
    return valor;
  }

  static #detectarMime(buffer) {
    if (buffer.length < 4) return null;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
    // WebP: RIFF....WEBP
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) return 'image/webp';
    return null;
  }

  static async #processarImagem(buffer) {
    try {
      return await sharp(buffer, { failOn: 'warning' })
        .rotate()
        .resize({ width: 1080, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
    } catch {
      throw AppError.badRequest('Arquivo de imagem invalido.');
    }
  }

  static #portfolioDto(row) {
    return {
      id: row.id,
      title: row.title ?? null,
      description: row.description ?? null,
      category: row.category ?? null,
      storagePath: row.storage_path ?? null,
      thumbnailPath: row.thumbnail_path ?? null,
      likesCount: row.likes_count ?? 0,
      viewsCount: row.views_count ?? 0,
      isFeatured: Boolean(row.is_featured),
      updatedAt: row.updated_at ?? null,
    };
  }
}

module.exports = ProfissionalService;
