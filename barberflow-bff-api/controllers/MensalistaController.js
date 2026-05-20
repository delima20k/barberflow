'use strict';

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');

/**
 * MensalistaController — Handlers HTTP para mensalistas.
 *
 * Extraí params de `req`, delega ao `MensalistaService` e serializa a resposta.
 *
 * Camada: presentation
 */
class MensalistaController extends BaseController {

  /** @type {import('../services/MensalistaService')} */
  #svc;

  /** @param {import('../services/MensalistaService')} svc */
  constructor(svc) {
    super();
    this.#svc = svc;
  }

  /**
   * POST /api/v1/mensalistas
   * Body: { barbershop_id, client_id }
   * → 201 com a row criada
   */
  async adicionar(req, res) {
    await this.handle(res, async () => {
      const { barbershop_id, client_id } = req.body ?? {};
      if (!barbershop_id) throw AppError.badRequest("Campo 'barbershop_id' é obrigatório.");
      if (!client_id)     throw AppError.badRequest("Campo 'client_id' é obrigatório.");

      const row = await this.#svc.adicionar(req.user.id, barbershop_id, client_id);
      this.created(res, row);
    });
  }

  /**
   * GET /api/v1/mensalistas?barbershop_id=X
   * → 200 com lista de mensalistas ativos
   */
  async listar(req, res) {
    await this.handle(res, async () => {
      const { barbershop_id } = req.query;
      if (!barbershop_id) throw AppError.badRequest("Query 'barbershop_id' é obrigatório.");

      const lista = await this.#svc.listar(req.user.id, barbershop_id);
      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/mensalistas/verificar?barbershop_id=X&client_id=Y
   * → 200 { ativo: boolean }
   */
  async verificar(req, res) {
    await this.handle(res, async () => {
      const { barbershop_id, client_id } = req.query;
      if (!barbershop_id) throw AppError.badRequest("Query 'barbershop_id' é obrigatório.");
      if (!client_id)     throw AppError.badRequest("Query 'client_id' é obrigatório.");

      const ativo = await this.#svc.verificar(barbershop_id, client_id);
      this.success(res, { ativo });
    });
  }

  /**
   * DELETE /api/v1/mensalistas/:id
   * → 204
   */
  async remover(req, res) {
    await this.handle(res, async () => {
      const { id } = req.params;
      await this.#svc.remover(req.user.id, id);
      this.noContent(res);
    });
  }

  /**
   * GET /api/v1/mensalistas/clientes-disponiveis?barbershop_id=X&q=busca
   * Busca textual — exige `q` não vazio. Lista vazia se `q` ausente.
   * → 200 com lista de perfis encontrados
   */
  async clientesDisponiveis(req, res) {
    await this.handle(res, async () => {
      const { barbershop_id, q = '' } = req.query;
      if (!barbershop_id) throw AppError.badRequest("Query 'barbershop_id' é obrigatório.");

      const lista = await this.#svc.buscarClientesDisponiveis(req.user.id, barbershop_id, q);
      this.success(res, lista, { total: lista.length });
    });
  }

  /**
   * GET /api/v1/mensalistas/favoritos-elegiveis?barbershop_id=X
   * Lista automática: usuários que favoritaram a barbearia ou qualquer
   * barbeiro vinculado a ela, excluindo mensalistas ativos.
   * → 200 com lista de perfis elegíveis
   */
  async favoritosElegiveis(req, res) {
    await this.handle(res, async () => {
      const { barbershop_id } = req.query;
      if (!barbershop_id) throw AppError.badRequest("Query 'barbershop_id' é obrigatório.");

      const lista = await this.#svc.listarFavoritosElegiveis(req.user.id, barbershop_id);
      this.success(res, lista, { total: lista.length });
    });
  }
}

module.exports = MensalistaController;
