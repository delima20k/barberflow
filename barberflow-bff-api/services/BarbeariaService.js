'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');
const R2Client    = require('../../src/infra/R2Client');
const { CACHE_TTL } = require('../config/cacheTtl');
const { CacheKeyBuilder } = require('../infrastructure/cache/CacheKeyBuilder');
const { CorrelationContext } = require('../observability/CorrelationContext');

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
  #sendMessageUseCase;
  #broadcaster;
  #publicCache;
  #geocoder;

  /** @param {import('../repositories/BarbeariaRepository')} repo */
  constructor(repo, sendMessageUseCase = null, broadcaster = null, publicCache = null, geocoder = null) {
    super('BarbeariaService');
    this.#repo = repo;
    this.#sendMessageUseCase = sendMessageUseCase;
    this.#broadcaster = broadcaster;
    this.#publicCache = publicCache;
    this.#geocoder = geocoder;
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
      return await this.#readPublicListCache(
        'featured',
        limit,
        () => this.#repo.getFeatured(limit),
      );
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
      return await this.#readPublicListCache(
        'all',
        limit,
        () => this.#repo.getAll(limit),
      );
    } catch (err) {
      throw AppError.unavailable('Serviço de barbearias temporariamente indisponível.');
    }
  }

  // INÍCIO ALTERAÇÃO - Service de interactions do portfolio da barbearia
  // Retorna mapa {imageId: interactions[]} usado pelo novo endpoint público.
  // best-effort: retorna {} se portfolio_messages ainda não existir no banco.
  async listarInteracoesPortfolio(imageIds) {
    const ids = Array.isArray(imageIds) ? imageIds.filter(Boolean) : [];
    if (!ids.length) return {};
    try {
      const mapaInteracoes = await this.#repo.listarInteracoesPortfolio(ids);
      const resultado = {};
      for (const id of ids) {
        const msgs = mapaInteracoes.get(id) ?? [];
        resultado[id] = BarbeariaService.#portfolioInteractionsDto(msgs, 0);
      }
      return resultado;
    } catch {
      return {};
    }
  }
  // FIM ALTERAÇÃO

  async listarPortfolio(barbershopId, filtros = {}) {
    this._uuid('barbershopId', barbershopId);
    const limit = BarbeariaService.#normalizarPortfolioLimit(filtros.limit);
    const offset = BarbeariaService.#normalizarPortfolioOffset(filtros.offset);

    const shop = await this.#repo.getAtivaPorId(barbershopId);
    if (!shop?.id) throw AppError.notFound('Barbearia nao encontrada.');

    const professionalIds = [
      shop.owner_id,
      ...await this.#repo.getProfessionalIdsAtivos(barbershopId),
    ].filter(Boolean);
    const idsUnicos = [...new Set(professionalIds)];

    if (!idsUnicos.length) return { items: [], total: 0, limit, offset };

    const result = await this.#repo.listarPortfolioAgregado(barbershopId, idsUnicos, { limit, offset });
    const profileMap = await this.#profilesMap(idsUnicos);
    const interactionsMap = await this.#portfolioInteractionsMap(result?.items ?? []);
    return {
      items: (result?.items ?? []).map(row => BarbeariaService.#portfolioDto(row, profileMap, shop, interactionsMap.get(row.id))),
      total: Number(result?.total ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Salva endereco completo e coordenadas da barbearia do usuario autenticado.
   * @param {string} userId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async salvarEndereco(userId, dados = {}) {
    this._uuid('userId', userId);

    if (!dados.barbershop_id) throw AppError.badRequest('barbershop_id é obrigatório.');
    const barbershopId = String(dados.barbershop_id).trim();
    this._uuid('barbershop_id', barbershopId);

    let hasCoords = dados.lat != null && dados.lng != null;
    let lat, lng;
    if (hasCoords) {
      lat = Number(dados.lat);
      lng = Number(dados.lng);
      this._coordenada(lat, lng);
    }

    const rua          = this._texto('address',      dados.address,                          160, true);
    const numero       = this._texto('numero',       dados.numero       ?? '',               30,  false);
    const complemento  = this._texto('complemento',  dados.complemento  ?? '',               80,  false);
    const city         = this._texto('city',         dados.city         ?? '',               80,  false);
    const state        = this._texto('state',        dados.state        ?? '',               2,   false).toUpperCase();
    const zipCode      = this._texto('zip_code',     dados.zip_code ?? dados.zipCode ?? '',  12,  false);
    const neighborhood = this._texto('neighborhood', dados.neighborhood  ?? '',               80,  false);
    const address      = [rua, numero, complemento].filter(Boolean).join(', ');

    // Invariante: endereço salvo ⇒ coordenadas salvas.
    // Cliente não enviou coords (GPS off) → geocodificar no servidor.
    if (!hasCoords && this.#geocoder) {
      console.info('[BarbeariaService] [Endereco] iniciando geocodificação server-side');
      const geo = await this.#geocoder.forwardGeocode({
        address: rua, neighborhood, city, state, zipCode,
      });
      if (geo.isOk() && geo.getValue()) {
        const coords = geo.getValue();
        lat = coords.lat;
        lng = coords.lng;
        this._coordenada(lat, lng);
        hasCoords = true;
        console.info(`[BarbeariaService] [Endereco] geocodificado: ${lat}, ${lng}`);
      } else {
        console.warn('[BarbeariaService] [Endereco] geocodificação falhou:', geo.isOk() ? 'sem resultado' : geo.getError());
      }
    }
    if (!hasCoords) {
      throw AppError.unprocessable(
        'Endereço não encontrado no provedor de geolocalização. Confira rua e cidade e tente novamente.'
      );
    }

    const result = await this.#repo.updateEndereco(userId, {
      address,
      ...(city         ? { city }                  : {}),
      ...(state        ? { state }                 : {}),
      ...(zipCode      ? { zip_code: zipCode }     : {}),
      ...(neighborhood ? { neighborhood }          : {}),
      latitude: lat,
      longitude: lng,
      updated_at: new Date().toISOString(),
    }, barbershopId);

    if (!result) throw AppError.notFound('Barbearia não encontrada.');

    await Promise.allSettled([
      this.#publicCache?.del(CacheKeyBuilder.build('barbershops', 'all',      'limit:60')),
      this.#publicCache?.del(CacheKeyBuilder.build('barbershops', 'featured', 'limit:6')),
    ]);

    return result;
  }

  /**
   * Salva preço e mensagem do plano mensal da barbearia do usuario autenticado.
   * @param {string} userId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async salvarMensalidade(userId, dados = {}) {
    this._uuid('userId', userId);

    const preco = dados.monthly_plan_price;
    if (preco !== null && preco !== undefined) {
      const n = Number(preco);
      if (!isFinite(n) || isNaN(n) || n < 0) {
        throw AppError.badRequest('monthly_plan_price deve ser null ou número >= 0.');
      }
    }

    const msg = dados.monthly_plan_message;
    if (msg !== null && msg !== undefined) {
      if (String(msg).length > 500) {
        throw AppError.badRequest('monthly_plan_message deve ter no máximo 500 caracteres.');
      }
    }

    return this.#repo.updateMensalidade(userId, {
      barbershop_id:         dados.barbershop_id ?? null,
      monthly_plan_price:   preco !== undefined ? (preco !== null ? Number(preco) : null) : null,
      monthly_plan_message: msg !== undefined ? (msg !== null ? String(msg) : null) : null,
      updated_at:           new Date().toISOString(),
    });
  }

  /**
   * Envia interesse no plano de mensalidade pelo chat canonico da BFF.
   * P2P textual nao e usado aqui: a persistencia via BFF/outbox e a fonte de verdade,
   * e a entrega P2P pode ser plugada futuramente como otimizacao apos persistir.
   * @param {string} userId
   * @param {string} barbershopId
   * @param {object} dados
   * @returns {Promise<{conversationId:string, message:object}>}
   */
  async enviarInteresseMensalidade(userId, barbershopId, dados = {}) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);

    if (!this.#sendMessageUseCase) {
      throw AppError.unavailable('Chat interno temporariamente indisponivel.');
    }

    const clientMessageId = this._texto('clientMessageId', dados.clientMessageId ?? '', 80, true);
    const planName = this._texto('planName', dados.planName ?? 'Plano Mensalidade', 80, false) || 'Plano Mensalidade';
    const monthlyPrice = BarbeariaService.#normalizarPrecoMensal(dados.monthlyPrice);

    const shop = await this.#repo.getAtivaPorId(barbershopId);
    if (!shop?.id || !shop.owner_id) throw AppError.notFound('Barbearia nao encontrada.');
    if (shop.owner_id === userId) {
      throw AppError.conflict('Nao e possivel enviar interesse para a propria barbearia.');
    }

    let conversationId = await this.#repo.encontrarConversaDireta(userId, shop.owner_id);
    if (!conversationId) {
      conversationId = await this.#repo.criarConversaDireta({
        clientId: userId,
        ownerId: shop.owner_id,
        createdBy: userId,
        metadata: {
          source: 'monthly_plan_interest',
          barbershopId: shop.id,
          barbershopName: shop.name ?? null,
        },
      });
    }

    const body = BarbeariaService.#montarMensagemInteresse({
      barbershopName: shop.name,
      planName,
      monthlyPrice,
    });
    if (!body.trim()) throw AppError.badRequest('Mensagem obrigatoria.');

    const result = await this.#sendMessageUseCase.execute({
      conversationId,
      senderId: userId,
      clientMessageId,
      body,
      attachments: [],
    });
    if (result.isFail()) {
      throw AppError.badRequest(result.getError());
    }

    return { conversationId, message: result.getValue() };
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
   * Carrega barbearia vinculada ao profissional para gestao de cadeiras.
   * @param {string} userId
   * @param {string} barbershopId
   * @returns {Promise<object>}
   */
  async getGestaoVinculada(userId, barbershopId) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);
    const shop = await this.#repo.getAtivaVinculada(barbershopId, userId);
    if (!shop?.id) throw AppError.notFound('Barbearia vinculada nao encontrada.');
    return shop;
  }

  /**
   * Lista status operacional dos barbeiros vinculados a uma barbearia.
   * Endpoint público: retorna apenas nome, profissional e boolean operacional.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarStatusBarbeiros(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    return this.#repo.listarStatusBarbeiros(barbershopId);
  }

  /**
   * Atualiza disponibilidade operacional do barbeiro autenticado.
   * @param {string} userId
   * @param {string} barbershopId
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async atualizarMeuStatusBarbeiro(userId, barbershopId, payload = {}) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);
    if (typeof payload.is_available !== 'boolean') {
      throw AppError.badRequest('is_available deve ser boolean.');
    }
    const data = await this.#repo.atualizarMeuStatusBarbeiro(barbershopId, userId, payload.is_available);

    // Broadcast via HTTP (best-effort) — entrega imediata independente de
    // postgres_changes ou estado do WebSocket do cliente.
    if (this.#broadcaster?.habilitado) {
      void this.#broadcaster.broadcast({
        topic:   `barbeiro-status:${barbershopId}`,
        event:   'status',
        payload: {
          barbershop_id:   barbershopId,
          professional_id: userId,
          is_available:    data.is_available,
          updated_at:      data.updated_at,
        },
        private: false,
      });
    }

    return data;
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
  async salvarStoryProfissional(userId, barbershopId, dados = {}) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);

    const storagePath = this._texto('storage_path', dados.storage_path ?? dados.path ?? '', 500, true);
    const mediaType = this._texto('media_type', dados.media_type ?? dados.mediaType ?? '', 20, true).toLowerCase();
    if (mediaType !== 'video') {
      throw AppError.badRequest('Apenas videos podem ser publicados nos stories da barbearia por este endpoint.');
    }

    const mediaId = dados.media_id ?? dados.mediaId ?? null;
    if (mediaId !== null) {
      this._uuid('media_id', mediaId);
      const existe = await this.#repo.existeMediaPorIdEOwner(mediaId, userId, 'stories');
      if (!existe) throw AppError.badRequest('media_id invalido ou nao pertence a este usuario.');
    }

    const shopOwner = await this.#repo.getAtivaPorOwner(userId);
    const isOwner = shopOwner?.id === barbershopId;
    const temVinculo = isOwner || await this.#repo.profissionalTemVinculoAtivo(barbershopId, userId);
    if (!temVinculo) throw AppError.forbidden('Profissional sem vinculo ativo com esta barbearia.');

    const quotaAtiva = await this.#repo.contarStoriesAtivos(userId, barbershopId);
    const limite = isOwner ? 3 : 1;
    if (quotaAtiva >= limite) throw AppError.conflict('Limite de stories ativos atingido. Aguarde o vídeo expirar (24h).');

    const expiresAt = dados.expires_at
      ? new Date(dados.expires_at)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiresAt.getTime())) throw AppError.badRequest('expires_at invalido.');

    return this.#repo.salvarStory({
      owner_id: userId,
      barbershop_id: barbershopId,
      storage_path: storagePath,
      thumbnail_path: dados.thumbnail_path ?? dados.thumbnailPath ?? null,
      media_type: mediaType,
      expires_at: expiresAt.toISOString(),
      media_id: mediaId,
    });
  }

  /**
   * Lista stories ativos de uma barbearia.
   * Stories com media_id recebem URL assinada R2 (60s). Legados usam storage_path.
   * @param {string} barbershopId
   * @returns {Promise<Array>}
   */
  async listarStoriesAtivos(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    const stories = await this.#repo.listarStoriesAtivos(barbershopId);
    if (!stories.length) return stories;

    try {
      const r2 = R2Client.getInstance();
      return Promise.all(stories.map(async story => {
        const r2Path = story.media_files?.path ?? null;
        if (!story.media_id || !r2Path) return story;
        try {
          const mediaUrl = await r2.presignedGet(r2Path, 3600);
          return { ...story, media_url: mediaUrl };
        } catch {
          const fallback = story.media_files?.public_url || null;
          return { ...story, media_url: fallback };
        }
      }));
    } catch {
      return stories;
    }
  }

  async #readPublicListCache(endpoint, limit, fetchFn) {
    const key = CacheKeyBuilder.build('barbershops', endpoint, `limit:${limit}`);
    const ttl = CACHE_TTL.BARBEARIA_PUBLIC_LIST;

    if (!this.#publicCache) {
      BarbeariaService.#setCacheDiagnostic('BYPASS', key);
      return fetchFn();
    }

    try {
      const cached = await this.#publicCache.get(key);
      if (cached !== null) {
        BarbeariaService.#setCacheDiagnostic('HIT', key);
        return cached;
      }
    } catch {
      BarbeariaService.#setCacheDiagnostic('ERROR', key);
      return fetchFn();
    }

    const fresh = await fetchFn();
    try {
      await this.#publicCache.set(key, fresh, ttl);
      BarbeariaService.#setCacheDiagnostic('MISS', key);
    } catch {
      BarbeariaService.#setCacheDiagnostic('ERROR', key);
    }
    return fresh;
  }

  static #setCacheDiagnostic(status, key) {
    const store = CorrelationContext.getStore();
    if (!store) return;
    store.cache = {
      status,
      key,
      context: 'barbershops_public',
    };
  }

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

  static #normalizarPortfolioLimit(valor) {
    const limit = Number(valor ?? 30);
    if (!Number.isInteger(limit) || limit < 1 || limit > 48) {
      throw AppError.badRequest('limit deve ser um inteiro entre 1 e 48.');
    }
    return limit;
  }

  static #normalizarPortfolioOffset(valor) {
    const offset = Number(valor ?? 0);
    if (!Number.isInteger(offset) || offset < 0) {
      throw AppError.badRequest('offset deve ser um inteiro maior ou igual a 0.');
    }
    return offset;
  }

  static #normalizarPrecoMensal(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    if (!isFinite(n) || Number.isNaN(n) || n < 0) return null;
    return n;
  }

  static #montarMensagemInteresse({ barbershopName, planName, monthlyPrice }) {
    const partes = [
      `Ola! Tenho interesse no plano de mensalidade da barbearia ${barbershopName ?? 'selecionada'}. Gostaria de saber mais informacoes.`,
      `Plano: ${planName}.`,
    ];
    if (monthlyPrice != null) {
      partes.push(`Valor: R$ ${monthlyPrice.toFixed(2).replace('.', ',')}.`);
    }
    return partes.join(' ');
  }

  async #profilesMap(ids) {
    const profiles = await this.#repo.getProfilesByIds?.(ids);
    return new Map((profiles ?? []).map(profile => [profile.id, profile]));
  }

  async #portfolioInteractionsMap(items) {
    const ids = (items ?? []).map(item => item?.id).filter(Boolean);
    if (!ids.length || typeof this.#repo.listarInteracoesPortfolio !== 'function') return new Map();
    try {
      return await this.#repo.listarInteracoesPortfolio(ids);
    } catch {
      return new Map();
    }
  }

  static #portfolioDto(row, profileMap = new Map(), shop = null, interactions = []) {
    const professionalId = row.owner_type === 'barbershop'
      ? shop?.owner_id ?? null
      : row.owner_id ?? null;
    const owner = row.owner ?? row.profile ?? profileMap.get(professionalId) ?? null;
    const likesCount = Math.max(0, Number(row.likes_count ?? 0));
    return {
      id: row.id,
      ownerId: row.owner_id ?? null,
      ownerType: row.owner_type ?? null,
      title: row.title ?? null,
      description: row.description ?? null,
      category: row.category ?? null,
      storagePath: row.storage_path ?? null,
      thumbnailPath: row.thumbnail_path ?? null,
      likesCount,
      interactions: BarbeariaService.#portfolioInteractionsDto(interactions, likesCount),
      viewsCount: row.views_count ?? 0,
      isFeatured: Boolean(row.is_featured),
      updatedAt: row.updated_at ?? null,
      professionalId,
      professionalName: owner?.full_name ?? null,
      professionalAvatarPath: owner?.avatar_path ?? null,
    };
  }

  static #portfolioInteractionsDto(interactions = [], likesCount = 0) {
    const items = (Array.isArray(interactions) ? interactions : [])
      .map(item => {
        const body = String(item?.body ?? '').trim();
        if (!body) return null;
        return {
          type: BarbeariaService.#isEmoji(body) ? 'emoji' : 'message',
          body,
          createdAt: item?.createdAt ?? item?.created_at ?? null,
          sender: {
            id: item?.sender?.id ?? item?.sender_id ?? null,
            nome: item?.sender?.nome ?? item?.sender?.fullName ?? item?.sender?.full_name ?? 'Usuário',
            avatarUrl: item?.sender?.avatarUrl ?? item?.sender?.avatar_url ?? null,
          },
        };
      })
      .filter(Boolean);
    if (likesCount > 0) {
      items.push({ type: 'like', body: '👍', count: likesCount });
    }
    return items;
  }

  static #isEmoji(value) {
    const texto = String(value ?? '').trim();
    return Boolean(texto) && texto.length <= 12 && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(texto);
  }
}

module.exports = BarbeariaService;
