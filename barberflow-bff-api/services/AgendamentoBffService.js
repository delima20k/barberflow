'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

// Entidade de domínio compartilhada (UMD — funciona em Node.js e browser)
const Agendamento = require('../../shared/js/Agendamento');

/**
 * AgendamentoBffService — Regras de negócio para agendamentos no BFF.
 *
 * Responsabilidade única: orquestrar validação e transições de estado
 * antes de delegar ao repositório.
 *
 * Race condition resolvida: criarAtomico() usa RPC PostgreSQL com
 * advisory lock por profissional — sem double-booking possível.
 */
class AgendamentoBffService extends BaseService {

  /** Máquina de estados de agendamento — igual ao backend legado. */
  static #TRANSICOES = {
    pending:     ['confirmed', 'cancelled'],
    confirmed:   ['in_progress', 'cancelled', 'no_show'],
    in_progress: ['done', 'cancelled'],
    done:        [],
    cancelled:   [],
    no_show:     [],
  };

  /** @type {import('../repositories/AgendamentoRepository')} */
  #repo;

  /**
   * @param {import('../repositories/AgendamentoRepository')} repo
   */
  constructor(repo) {
    super('AgendamentoBffService');
    this.#repo = repo;
  }

  // ── Públicos ──────────────────────────────────────────────────────

  /**
   * Lista os agendamentos do cliente autenticado com cursor pagination.
   * @param {string} clientId — UUID do cliente (extraído do JWT)
   * @param {object} [opts]
   * @param {string} [opts.cursor]   — cursor da página anterior (scheduled_at)
   * @param {number} [opts.limit=20]
   * @returns {Promise<{ items: object[], nextCursor: string|null }>}
   */
  async listar(clientId, opts = {}) {
    this._uuid('client_id', clientId);
    return this.#repo.getByCliente(clientId, opts);
  }

  /**
   * Cria um novo agendamento para o cliente autenticado.
   * Valida UUIDs e entidade; a verificação de conflito de horário
   * é delegada à RPC atômica no banco (sem race condition).
   * @param {object} dados    — body do request (sem client_id)
   * @param {string} clientId — UUID injetado do JWT
   * @returns {Promise<object>}
   */
  async criar(dados, clientId, opts = {}) {
    const diagnostics = opts.diagnostics ?? null;
    // Validação de UUIDs obrigatórios na fronteira de entrada
    const validatePayload = () => {
      this._uuid('professional_id', dados.professional_id);
      this._uuid('barbershop_id',   dados.barbershop_id);
      this._uuid('service_id',      dados.service_id);
    };
    if (diagnostics) await diagnostics.time('payload_validation', async () => validatePayload());
    else validatePayload();

    diagnostics?.note('serviceLookup', 'not_performed_in_bff');
    diagnostics?.note('professionalLookup', 'not_performed_in_bff');
    diagnostics?.note('notificationsOutbox', 'not_present_in_appointment_flow');

    // Monta payload completo com client_id do JWT e status padrão
    const payload = { ...dados, client_id: clientId };
    const validateService = () => Agendamento.fromRow(payload).validar();

    // Validação da entidade (data futura, duration_min, status allowlist)
    const { ok, erros } = diagnostics
      ? await diagnostics.time('service_validation', async () => validateService())
      : validateService();
    if (!ok) throw AppError.badRequest(erros.join('; '));

    // RPC atômica: verifica conflito + insere na mesma transação (sem race condition)
    return this.#repo.criarAtomico(payload, { diagnostics });
  }

  /**
   * Atualiza o status de um agendamento.
   * Valida propriedade (cliente ou profissional) e transição de estado.
   * @param {string} id         — UUID do agendamento
   * @param {string} novoStatus — status desejado
   * @param {string} userId     — UUID do usuário autenticado (JWT)
   * @returns {Promise<object>}
   */
  async atualizarStatus(id, novoStatus, userId) {
    this._uuid('id', id);
    this._enum('status', novoStatus, Object.keys(AgendamentoBffService.#TRANSICOES));

    const ag = await this.#repo.getById(id);
    if (!ag) throw AppError.notFound('Agendamento não encontrado.');

    if (ag.client_id !== userId && ag.professional_id !== userId) {
      throw AppError.forbidden();
    }

    AgendamentoBffService.#validarTransicao(ag.status, novoStatus);

    return this.#repo.atualizarStatus(id, novoStatus);
  }

  /**
   * Cancela um agendamento.
   * Atalho para atualizarStatus(id, 'cancelled', userId).
   * @param {string} id     — UUID do agendamento
   * @param {string} userId — UUID do usuário autenticado (JWT)
   * @returns {Promise<object>}
   */
  async cancelar(id, userId) {
    return this.atualizarStatus(id, 'cancelled', userId);
  }

  // ── Privados ──────────────────────────────────────────────────────

  /**
   * Valida se a transição de status é permitida pela máquina de estados.
   * @param {string} atual
   * @param {string} novo
   */
  static #validarTransicao(atual, novo) {
    const permitidos = AgendamentoBffService.#TRANSICOES[atual] ?? [];
    if (!permitidos.includes(novo)) {
      throw AppError.unprocessable(`Transição inválida: ${atual} → ${novo}.`);
    }
  }
}

module.exports = AgendamentoBffService;
