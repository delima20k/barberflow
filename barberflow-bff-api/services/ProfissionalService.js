'use strict';

const crypto = require('node:crypto');
const sharp  = require('sharp');

const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');
const ProfissionalPublicProfileDto = require('../application/profissional/dto/ProfissionalPublicProfileDto');
const ContentModerationService = require('./ContentModerationService');

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

  async iniciarMensagemBarbearia(clienteId, professionalId, dados = {}) {
    this._uuid('clienteId', clienteId);
    this._uuid('professionalId', professionalId);

    const bodyInformado = Object.prototype.hasOwnProperty.call(dados ?? {}, 'body');
    const bodyCustomizado = bodyInformado
      ? this._texto('body', dados.body ?? '', 240, false)
      : '';
    if (bodyInformado && !bodyCustomizado) {
      throw AppError.badRequest('Mensagem obrigatoria.');
    }

    // Moderação de conteúdo — bloqueia mensagens ofensivas antes de qualquer persistência
    if (bodyCustomizado) {
      const mod = ContentModerationService.verificar(bodyCustomizado);
      if (mod.bloqueado) {
        throw AppError.badRequest('Mensagem nao permitida. Revise o conteudo antes de enviar.');
      }
    }

    let portfolioImageId = null;
    if (Object.prototype.hasOwnProperty.call(dados ?? {}, 'portfolioImageId') && dados.portfolioImageId) {
      this._uuid('portfolioImageId', dados.portfolioImageId);
      portfolioImageId = dados.portfolioImageId;
    }

    let clientMessageId = null;
    if (Object.prototype.hasOwnProperty.call(dados ?? {}, 'clientMessageId') && dados.clientMessageId) {
      clientMessageId = this._texto('clientMessageId', dados.clientMessageId, 80, true);
    }

    // Salva diretamente em portfolio_messages (independente do sistema de chat)
    if (!portfolioImageId) {
      // Sem imagem alvo: fluxo legado via chat (pode não funcionar em todos os ambientes)
      return { conversationId: null, message: null };
    }

    const body = bodyCustomizado;
    if (!body) throw AppError.badRequest('Mensagem obrigatoria.');

    // Best-effort: retorna 201 mesmo que a tabela ainda não exista em produção.
    // Quando a migration 20260531000003 rodar, as mensagens passam a ser persistidas.
    try {
      await this.#repo.salvarMensagemPortfolio({
        portfolioImageId,
        professionalId,
        senderId: clienteId,
        body,
      });
    } catch (saveErr) {
      // eslint-disable-next-line no-console
      console.warn('[ProfissionalService] portfolio_messages indisponivel:', saveErr?.message);
    }

    return { conversationId: null, message: { body } };
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

  async curtirPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const result = await this.#repo.curtirPortfolioImagem(userId, imageId);
    if (!result?.exists) throw AppError.notFound('Imagem do portfolio nao encontrada.');
    return {
      imageId,
      liked: true,
      likesCount: Math.max(0, Number(result.likes_count ?? 0)),
    };
  }

  async listarCurtidasPortfolio(userId, idsParam) {
    this._uuid('userId', userId);
    const ids = String(idsParam ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .slice(0, 48);

    ids.forEach(id => this._uuid('imageId', id));
    if (!ids.length) return { likedIds: [] };

    const likedIds = await this.#repo.listarCurtidasPortfolio(userId, ids);
    return { likedIds: Array.isArray(likedIds) ? likedIds : [] };
  }

  async descurtirPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const result = await this.#repo.descurtirPortfolioImagem(userId, imageId);
    if (!result?.exists) throw AppError.notFound('Imagem do portfolio nao encontrada.');
    return {
      imageId,
      liked: false,
      likesCount: Math.max(0, Number(result.likes_count ?? 0)),
    };
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

  /**
   * Lista mensagens recebidas em uma imagem de portfólio (visível apenas ao dono).
   * @param {string} professionalId — usuário autenticado (deve ser o dono)
   * @param {string} imageId        — UUID da portfolio_image
   * @returns {Promise<{ messages: object[] }>}
   */
  async listarMensagensPortfolioImagem(professionalId, imageId) {
    this._uuid('professionalId', professionalId);
    this._uuid('imageId', imageId);

    const result = await this.#repo.listarMensagensPortfolioImagem(professionalId, imageId, 50);
    if (!result.ownerVerified) {
      throw AppError.forbidden('Acesso negado. Esta imagem nao pertence ao seu perfil.');
    }

    return {
      messages: result.messages.map(m => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        sender: {
          id: m.sender.id,
          nome: m.sender.nome,
          avatarUrl: m.sender.avatarPath
            ? ProfissionalService.#avatarUrl(m.sender.avatarPath)
            : null,
        },
      })),
    };
  }

  static #avatarUrl(avatarPath) {
    const base = process.env.SUPABASE_URL ?? '';
    if (!base || !avatarPath) return null;
    return `${base}/storage/v1/object/public/avatars/${avatarPath}`;
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
