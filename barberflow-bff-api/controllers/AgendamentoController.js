'use strict';

const BaseController = require('./BaseController');

/**
 * AgendamentoController — Endpoint handlers para /api/agendamentos.
 *
 * Responsabilidade única: extrair dados do request, delegar ao serviço
 * e responder com o formato padrão { ok, dados }.
 */
class AgendamentoController extends BaseController {

  /** @type {import('../services/AgendamentoBffService')} */
  #service;

  /**
   * @param {import('../services/AgendamentoBffService')} service
   */
  constructor(service) {
    super();
    this.#service = service;
  }

  /**
   * GET /api/agendamentos[?cursor=<scheduled_at>&limit=20]
   * Lista os agendamentos do usuário autenticado com cursor pagination.
   * Retorna { items: [...], nextCursor: string|null }.
   */
  async listar(req, res) {
    await this.handle(res, async () => {
      const cursor = req.query.cursor ?? undefined;
      const limit  = req.query.limit ? Math.min(Number(req.query.limit) || 20, 100) : 20;

      const resultado = await this.#service.listar(req.user.id, { cursor, limit });
      this.success(res, resultado.items, { nextCursor: resultado.nextCursor });
    });
  }

  /**
   * POST /api/agendamentos
   * Cria um novo agendamento para o usuário autenticado.
   */
  async criar(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.criar(req.body, req.user.id);
      this.created(res, dados);
    });
  }

  /**
   * PATCH /api/agendamentos/:id
   * Atualiza o status de um agendamento.
   */
  async atualizarStatus(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.atualizarStatus(
        req.params.id,
        req.body.status,
        req.user.id,
      );
      this.success(res, dados);
    });
  }

  /**
   * DELETE /api/agendamentos/:id
   * Cancela um agendamento.
   */
  async cancelar(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.cancelar(req.params.id, req.user.id);
      this.success(res, dados);
    });
  }
}

module.exports = AgendamentoController;
