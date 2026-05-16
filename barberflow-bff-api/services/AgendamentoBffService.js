'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

// Entidade de domínio compartilhada (UMD — funciona em Node.js e browser)
const Agendamento = require('../../shared/js/Agendamento');

/**
 * AgendamentoBffService — Regras de negócio para agendamentos no BFF.
 *
 * Responsabilidade única: orquestrar validação, checagem de conflitos
 * e transições de estado antes de delegar ao repositório.
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

  /**
   * Janela retroativa de busca de conflitos — cobre a duração máxima de um serviço.
   * Permite detectar agendamentos anteriores cujo término se sobreponha ao novo horário.
   */
  static #JANELA_CONFLITO_MS = 8 * 3_600_000;

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
   * Lista os agendamentos do cliente autenticado.
   * @param {string} clientId — UUID do cliente (extraído do JWT)
   * @returns {Promise<object[]>}
   */
  async listar(clientId) {
    this._uuid('client_id', clientId);
    return this.#repo.getByCliente(clientId);
  }

  /**
   * Cria um novo agendamento para o cliente autenticado.
   * Valida UUIDs, entidade, e detecta conflito de horário.
   * @param {object} dados    — body do request (sem client_id)
   * @param {string} clientId — UUID injetado do JWT
   * @returns {Promise<object>}
   */
  async criar(dados, clientId) {
    // Validação de UUIDs obrigatórios na fronteira de entrada
    this._uuid('professional_id', dados.professional_id);
    this._uuid('barbershop_id',   dados.barbershop_id);
    this._uuid('service_id',      dados.service_id);

    // Monta payload completo com client_id do JWT e status padrão
    const payload = { ...dados, client_id: clientId };
    const ag      = Agendamento.fromRow(payload);

    // Validação da entidade (data futura, duration_min, status allowlist)
    const { ok, erros } = ag.validar();
    if (!ok) throw AppError.badRequest(erros.join('; '));

    // Verificação de conflito de horário com o profissional
    await this.#verificarConflito(ag.professionalId, ag.scheduledAt, ag.durationMin);

    return this.#repo.criar(payload);
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
   * Verifica se há conflito de horário para o profissional.
   * @param {string} professionalId
   * @param {Date}   scheduledAt
   * @param {number} durationMin
   */
  async #verificarConflito(professionalId, scheduledAt, durationMin) {
    const inicio     = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    const fim        = new Date(inicio.getTime() + durationMin * 60_000);
    const janelaBaixo = new Date(inicio.getTime() - AgendamentoBffService.#JANELA_CONFLITO_MS);

    const existentes = await this.#repo.getConflitos(professionalId, janelaBaixo, fim);

    for (const ag of existentes) {
      const agInicio = new Date(ag.scheduled_at);
      const agFim    = new Date(agInicio.getTime() + (ag.duration_min ?? 30) * 60_000);

      const sobreposicao = !(fim <= agInicio || inicio >= agFim);
      if (sobreposicao) {
        throw AppError.conflict('Horário não disponível: conflito com agendamento existente.');
      }
    }
  }

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
