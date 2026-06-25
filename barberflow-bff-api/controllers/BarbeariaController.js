'use strict';

const { performance } = require('node:perf_hooks');

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');
const { CorrelationContext } = require('../observability/CorrelationContext');

/**
 * BarbeariaController — Endpoints públicos de barbearias para o BFF.
 *
 * Rotas (todas públicas — sem autenticação):
 *   GET /api/v1/barbearias?lat=X&lng=Y[&raio=5]     → proximas
 *   GET /api/v1/barbearias/destaque[?limit=6]        → top rated
 *   GET /api/v1/barbearias/todas[?limit=60]          → todas ativas
 *
 * Camada: interfaces
 */
class BarbeariaController extends BaseController {

  /** @type {import('../services/BarbeariaService')} */
  #service;

  /** @type {import('../services/BarbeariaMediaService')} */
  #mediaService;

  /** @type {import('../application/stories/DeleteStoryUseCase').DeleteStoryUseCase|null} */
  #deleteStoryUseCase;

  /**
   * @param {import('../services/BarbeariaService')} service
   * @param {import('../services/BarbeariaMediaService')} [mediaService]
   * @param {import('../application/stories/DeleteStoryUseCase').DeleteStoryUseCase} [deleteStoryUseCase]
   */
  constructor(service, mediaService = null, deleteStoryUseCase = null) {
    super();
    this.#service             = service;
    this.#mediaService        = mediaService;
    this.#deleteStoryUseCase  = deleteStoryUseCase;
  }

  // ── Handlers ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/barbearias?lat=X&lng=Y[&raio=5]
   * Lista barbearias próximas à coordenada informada.
   */
  async proximas(req, res) {
    await this.handle(res, async () => {
      const lat   = BarbeariaController.#parseCoord(req.query.lat,  'lat');
      const lng   = BarbeariaController.#parseCoord(req.query.lng,  'lng');
      const raio  = BarbeariaController.#parseLimit(req.query.raio, 'raio', 5, 100, 5);

      const lista = await this.#service.listarProximas(lat, lng, raio);

      this.cachePublico(res, 30, 60);
      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/barbearias/destaque[?limit=6]
   * Lista barbearias em destaque (top rated).
   */
  async destaque(req, res) {
    await this.handle(res, async () => {
      const handlerStarted = performance.now();
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 6);

      const lista = await this.#service.listarDestaque(limit);

      BarbeariaController.#setCacheDiagnosticHeader(res);
      BarbeariaController.#setDiagnosticsTiming(res, performance.now() - handlerStarted);
      if (this.etag(req, res, lista)) return;
      this.cachePublico(res, 60, 300);
      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/barbearias/todas[?limit=60]
   * Lista todas as barbearias ativas.
   */
  async todas(req, res) {
    await this.handle(res, async () => {
      const handlerStarted = performance.now();
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 60);

      const lista = await this.#service.listarTodas(limit);

      BarbeariaController.#setCacheDiagnosticHeader(res);
      BarbeariaController.#setDiagnosticsTiming(res, performance.now() - handlerStarted);
      if (this.etag(req, res, lista)) return;
      this.cachePublico(res, 60, 300);
      this.success(res, lista, { total: lista.length });
    });
  }

  // INÍCIO ALTERAÇÃO - Endpoint de interactions do portfolio da barbearia
  // Novo endpoint público que retorna mensagens/emojis/curtidas por imagem.
  // Usado por BarbeariaPage.#fetchPortfolio para carregar interactions das imagens
  // da barbearia e exibir animações ao abrir o viewer em tela cheia.
  /**
   * GET /api/v1/barbearias/portfolio/interacoes?ids=id1,id2,...
   * Retorna mapa de interactions por imageId para as imagens informadas.
   * Público — sem autenticação.
   */
  async portfolioInteracoes(req, res) {
    await this.handle(res, async () => {
      const idsParam = String(req.query.ids ?? '').trim();
      if (!idsParam) {
        this.success(res, {});
        return;
      }
      const ids = idsParam
        .split(',')
        .map(s => s.trim())
        .filter(s => /^[0-9a-f-]{36}$/i.test(s))
        .slice(0, 20); // max 20 IDs por chamada

      if (!ids.length) {
        this.success(res, {});
        return;
      }

      const mapaInteracoes = await this.#service.listarInteracoesPortfolio(ids);
      this.cachePublico(res, 30, 60);
      this.success(res, mapaInteracoes);
    });
  }
  // FIM ALTERAÇÃO

  /**
   * GET /api/v1/barbearias/:barbershop_id/portfolio
   * Lista o portfolio geral da barbearia/equipe.
   */
  async portfolio(req, res) {
    await this.handle(res, async () => {
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 48, 30);
      const offset = BarbeariaController.#parseOffset(req.query.offset, 'offset', 0);

      const dados = await this.#service.listarPortfolio(barbershopId, { limit, offset });

      this.cachePublico(res, 30, 120);
      this.success(res, dados, { total: dados.total });
    });
  }

  /**
   * PATCH /api/v1/barbearias/minha/endereco
   * Atualiza endereco e coordenadas da barbearia do usuario autenticado.
   */
  async salvarEndereco(req, res) {
    await this.handle(res, async () => {
      const atualizado = await this.#service.salvarEndereco(req.user.id, req.body ?? {});
      this.success(res, atualizado);
    });
  }

  /**
   * PATCH /api/v1/barbearias/minha/mensalidade
   * Atualiza preço e mensagem do plano mensal da barbearia do usuario autenticado.
   */
  async salvarMensalidade(req, res) {
    await this.handle(res, async () => {
      const atualizado = await this.#service.salvarMensalidade(req.user.id, req.body ?? {});
      this.success(res, atualizado);
    });
  }

  /**
   * POST /api/v1/barbearias/:barbershop_id/mensalidade/interesse
   * Envia interesse no plano mensal via chat interno canonico da BFF.
   */
  async interesseMensalidade(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const dto = await this.#service.enviarInteresseMensalidade(req.user.id, barbershopId, req.body ?? {});
      this.created(res, dto);
    });
  }

  /**
   * PATCH /api/v1/barbearias/minha/imagem?tipo=logo|cover
   * Atualiza logo/capa da barbearia do usuario autenticado via BFF.
   */
  async salvarImagem(req, res) {
    await this.handle(res, async () => {
      const atualizado = await this.#mediaService.salvarImagem(
        req.user.id,
        String(req.query.tipo ?? ''),
        req.body,
        String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase(),
      );
      this.success(res, atualizado);
    });
  }

  /**
   * PATCH /api/v1/barbearias/minha/servicos/imagem
   * Processa imagem de servico/produto da barbearia do usuario autenticado.
   */
  /** PATCH /api/v1/barbearias/minha/og-card — salva card de convite no Storage. */
  async salvarOgCard(req, res) {
    await this.handle(res, async () => {
      const result = await this.#mediaService.salvarOgCard(req.user.id, req.body);
      this.success(res, result);
    });
  }

  async salvarImagemServico(req, res) {
    await this.handle(res, async () => {
      const atualizado = await this.#mediaService.salvarImagemServico(
        req.user.id,
        req.body,
        String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase(),
      );
      this.success(res, atualizado);
    });
  }

  /**
   * GET /api/v1/barbearias/minha/convites/barbeiros-disponiveis?busca=&limit=20
   * Lista barbeiros elegíveis para convite da barbearia autenticada.
   */
  async buscarBarbeirosDisponiveis(req, res) {
    await this.handle(res, async () => {
      const busca = String(req.query.busca ?? '').trim().slice(0, 80);
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 50, 20);
      const dados = await this.#service.buscarBarbeirosDisponiveis(req.user.id, busca, limit);
      this.success(res, dados, { total: dados.length });
    });
  }

  /**
   * POST /api/v1/barbearias/minha/convites
   * Envia convites em massa para barbeiros selecionados.
   */
  async enviarConvites(req, res) {
    await this.handle(res, async () => {
      const resultado = await this.#service.enviarConvites(req.user.id, req.body ?? {});
      this.success(res, resultado);
    });
  }

  /**
   * GET /api/v1/barbearias/minha/equipe-status
   */
  async getEquipeComStatus(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.getEquipeComStatus(req.user.id);
      this.success(res, dados);
    });
  }

  /**
   * GET /api/v1/barbearias/:barbershop_id/gestao
   */
  async getGestaoVinculada(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const dados = await this.#service.getGestaoVinculada(req.user.id, barbershopId);
      this.success(res, dados);
    });
  }

  /**
   * GET /api/v1/barbearias/:barbershop_id/barbeiros-status
   */
  async listarStatusBarbeiros(req, res) {
    await this.handle(res, async () => {
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const dados = await this.#service.listarStatusBarbeiros(barbershopId);
      this.cachePublico(res, 10, 30);
      this.success(res, dados, { total: dados.length });
    });
  }

  /**
   * PATCH /api/v1/barbearias/:barbershop_id/me/status
   */
  async atualizarMeuStatusBarbeiro(req, res) {
    await this.handle(res, async () => {
      res.setHeader('Cache-Control', 'private, no-store');
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const dados = await this.#service.atualizarMeuStatusBarbeiro(req.user.id, barbershopId, req.body ?? {});
      this.success(res, dados);
    });
  }

  /**
   * POST /api/v1/barbearias/minha/dispensar/:professional_id
   */
  async dispensarBarbeiro(req, res) {
    await this.handle(res, async () => {
      const professionalId = String(req.params.professional_id ?? '').trim();
      if (!professionalId) throw AppError.badRequest('professional_id é obrigatório.');
      const resultado = await this.#service.dispensarBarbeiro(req.user.id, professionalId);
      this.success(res, resultado);
    });
  }

  /**
   * DELETE /api/v1/barbearias/minha/convites/:invite_id
   */
  async cancelarConvite(req, res) {
    await this.handle(res, async () => {
      const inviteId = String(req.params.invite_id ?? '').trim();
      if (!inviteId) throw AppError.badRequest('invite_id é obrigatório.');
      const resultado = await this.#service.cancelarConvite(req.user.id, inviteId);
      this.success(res, resultado);
    });
  }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Parseia e valida um parâmetro de coordenada da query string.
   * Lança AppError(400) se ausente ou não numérico.
   * @param {string|undefined} valor
   * @param {string}           nome
   * @returns {number}
   */
  /**
   * Lista stories ativos de uma barbearia com URLs assinadas para R2.
   */
  async listarStories(req, res) {
    await this.handle(res, async () => {
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const stories = await this.#service.listarStoriesAtivos(barbershopId, req.user?.id ?? null);
      this.success(res, stories);
    });
  }

  /**
   * GET /api/v1/barbearias/stories/feed
   * Retorna barbearias com stories ativos para o feed da home.
   * Pública — não exige autenticação.
   */
  async listarFeedStories(req, res) {
    await this.handle(res, async () => {
      const feed = await this.#service.listarFeedStories(req.user?.id ?? null);
      this.success(res, feed);
    });
  }

  /**
   * DELETE /api/v1/barbearias/:barbershop_id/stories/:story_id
   * Exclusão manual de story pelo dono. Retorna 200 com { storyRemoved, storageDeletionPending }.
   */
  async excluirStory(req, res) {
    await this.handle(res, async () => {
      if (!this.#deleteStoryUseCase) throw AppError.unavailable('Servico de armazenamento de midia indisponivel.');
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      const storyId      = String(req.params.story_id      ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      if (!storyId)      throw AppError.badRequest('story_id e obrigatorio.');
      const resultado = await this.#deleteStoryUseCase.execute({
        storyId,
        ownerId:      req.user.id,
        barbershopId,
      });
      this.success(res, resultado);
    });
  }

  /**
   * Registra story enviado por profissional vinculado.
   */
  async salvarStoryProfissional(req, res) {
    await this.handle(res, async () => {
      const barbershopId = String(req.params.barbershop_id ?? '').trim();
      if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
      const resultado = await this.#service.salvarStoryProfissional(req.user.id, barbershopId, req.body ?? {});
      this.success(res, resultado);
    });
  }

  static #parseCoord(valor, nome) {
    if (valor === undefined || valor === null || valor === '') {
      throw AppError.badRequest(`Parâmetro '${nome}' é obrigatório.`);
    }
    const num = Number(valor);
    if (!isFinite(num)) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve ser numérico.`);
    }
    return num;
  }

  /**
   * Parseia e valida um parâmetro inteiro opcional com valor padrão.
   * Lança AppError(400) se informado mas inválido.
   * @param {string|undefined} valor
   * @param {string}           nome
   * @param {number}           min
   * @param {number}           max
   * @param {number}           padrao
   * @returns {number}
   */
  static #parseLimit(valor, nome, min, max, padrao) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const num = Number(valor);
    if (!isFinite(num) || !Number.isInteger(num)) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve ser um inteiro.`);
    }
    if (num < min || num > max) {
      throw AppError.badRequest(`Parâmetro '${nome}' deve estar entre ${min} e ${max}.`);
    }
    return num;
  }

  static #parseOffset(valor, nome, padrao) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const num = Number(valor);
    if (!isFinite(num) || !Number.isInteger(num) || num < 0) {
      throw AppError.badRequest(`ParÃ¢metro '${nome}' deve ser um inteiro maior ou igual a 0.`);
    }
    return num;
  }

  static #setDiagnosticsTiming(res, handlerDurationMs) {
    const diagnostics = CorrelationContext.diagnostics;
    if (!diagnostics?.enabled || res.headersSent) return;

    const supabaseDurationMs = (diagnostics.timings ?? [])
      .filter(timing => timing.component === 'supabase')
      .reduce((sum, timing) => sum + (Number(timing.durationMs) || 0), 0);

    const bffDuration = handlerDurationMs.toFixed(2);
    const supabaseDuration = supabaseDurationMs.toFixed(2);
    const cacheStatus = CorrelationContext.getStore().cache?.status ?? 'BYPASS';

    res.setHeader('Timing-Allow-Origin', '*');
    res.setHeader('Server-Timing', `bff;dur=${bffDuration}, supabase;dur=${supabaseDuration}, cache;desc="${cacheStatus}"`);
    res.setHeader('X-BFF-Duration-Ms', bffDuration);
    res.setHeader('X-Supabase-Duration-Ms', supabaseDuration);
  }

  static #setCacheDiagnosticHeader(res) {
    if (res.headersSent) return;
    const cacheStatus = CorrelationContext.getStore().cache?.status ?? 'BYPASS';
    res.setHeader('X-Barberflow-Cache', cacheStatus);
  }
}

module.exports = BarbeariaController;
