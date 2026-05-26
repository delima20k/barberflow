'use strict';

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');

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

  /**
   * @param {import('../services/BarbeariaService')} service
   * @param {import('../services/BarbeariaMediaService')} [mediaService]
   */
  constructor(service, mediaService = null) {
    super();
    this.#service      = service;
    this.#mediaService = mediaService;
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
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 6);

      const lista = await this.#service.listarDestaque(limit);

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
      const limit = BarbeariaController.#parseLimit(req.query.limit, 'limit', 1, 100, 60);

      const lista = await this.#service.listarTodas(limit);

      if (this.etag(req, res, lista)) return;
      this.cachePublico(res, 60, 300);
      this.success(res, lista, { total: lista.length });
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
}

module.exports = BarbeariaController;
