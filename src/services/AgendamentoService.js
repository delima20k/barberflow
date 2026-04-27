'use strict';

// =============================================================
// AgendamentoService.js — Regras de negócio para agendamentos.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao AgendamentoRepository.
// Contém validação de negócio, regras de status e orquestração.
// =============================================================

const Agendamento = require('../entities/Agendamento');
const BaseService = require('../infra/BaseService');

class AgendamentoService extends BaseService {

  #agendamentoRepository;

  /** @param {import('../repositories/AgendamentoRepository')} agendamentoRepository */
  constructor(agendamentoRepository) {
    super('AgendamentoService');
    this.#agendamentoRepository = agendamentoRepository;
  }

  /**
   * Lista agendamentos de um profissional em um período.
   * @param {string}      professionalId
   * @param {Date|string} inicio
   * @param {Date|string} fim
   * @returns {Promise<Agendamento[]>}
   */
  async listarPorProfissional(professionalId, inicio, fim) {
    this._uuid('professionalId', professionalId);

    const dtInicio = new Date(inicio);
    const dtFim    = new Date(fim);

    if (isNaN(dtInicio.getTime()) || isNaN(dtFim.getTime()))
      throw this._erro('Datas de início e fim inválidas.');

    if (dtInicio > dtFim)
      throw this._erro('Data de início deve ser anterior à data de fim.');

    const rows = await this.#agendamentoRepository.getByProfissional(professionalId, dtInicio, dtFim);
    return rows.map(r => Agendamento.fromRow(r));
  }

  /**
   * Lista agendamentos de um cliente.
   * @param {string} clientId
   * @returns {Promise<Agendamento[]>}
   */
  async listarPorCliente(clientId) {
    this._uuid('clientId', clientId);
    const rows = await this.#agendamentoRepository.getByCliente(clientId);
    return rows.map(r => Agendamento.fromRow(r));
  }

  /**
   * Cria um novo agendamento após validação completa.
   * Verifica conflito de horário antes de persistir.
   * @param {object} dados
   * @returns {Promise<Agendamento>}
   */
  async criarAgendamento(dados) {
    // Valida via entidade (inclui regras de domínio)
    const ag = Agendamento.fromRow(dados);
    const { ok, erros } = ag.validar();
    if (!ok) throw this._erro(erros.join('; '));

    // Regra de negócio: profissional não pode ter dois agendamentos simultâneos
    await this.#verificarSlotDisponivel(ag.professionalId, ag.scheduledAt, ag.durationMin);

    const row = await this.#agendamentoRepository.criar(dados);
    return Agendamento.fromRow(row);
  }

  /**
   * Atualiza o status de um agendamento.
   * Verifica propriedade (ownership) e regras de transição.
   * @param {string} id
   * @param {string} novoStatus
   * @param {string} userId — ID do usuário autenticado (JWT)
   * @returns {Promise<Agendamento>}
   */
  async atualizarStatus(id, novoStatus, userId) {
    this._uuid('id', id);
    this._uuid('userId', userId);
    this._enum('status', novoStatus, Agendamento.statusValidos);

    const atual = await this.#agendamentoRepository.getById(id);
    if (!atual) throw this._erro('Agendamento não encontrado.', 404);

    // Regra de negócio: apenas o cliente ou o profissional podem modificar
    const isCliente      = atual.client?.id      === userId;
    const isProfissional = atual.professional?.id === userId;
    if (!isCliente && !isProfissional) {
      throw this._erro('Não autorizado a modificar este agendamento.', 403);
    }

    AgendamentoService.#validarTransicao(atual.status, novoStatus);

    const row = await this.#agendamentoRepository.atualizarStatus(id, novoStatus);
    return Agendamento.fromRow(row);
  }

  /**
   * Cancela um agendamento.
   * Regra: apenas agendamentos pending ou confirmed podem ser cancelados.
   * @param {string} id
   * @param {string} userId — ID do usuário autenticado
   * @returns {Promise<Agendamento>}
   */
  async cancelarAgendamento(id, userId) {
    return this.atualizarStatus(id, 'cancelled', userId);
  }

  // ── Privados ──────────────────────────────────────────────

  /**
   * Verifica se o profissional tem disponibilidade no horário solicitado.
   * Consulta o repositório por conflitos no período e aplica overlap check em JS.
   * @param {string}      professionalId
   * @param {Date|string} scheduledAt
   * @param {number}      durationMin
   */
  async #verificarSlotDisponivel(professionalId, scheduledAt, durationMin) {
    const inicio = new Date(scheduledAt);
    const fim    = new Date(inicio.getTime() + durationMin * 60_000);

    // Janela de consulta: até 8h antes do início para capturar agendamentos longos
    const janelaBaixo = new Date(inicio.getTime() - 8 * 3_600_000);

    const existentes = await this.#agendamentoRepository.getConflitos(
      professionalId, janelaBaixo, fim,
    );

    for (const ag of existentes) {
      const agInicio = new Date(ag.scheduled_at);
      const agFim    = new Date(agInicio.getTime() + (ag.duration_min ?? 30) * 60_000);

      // Overlap: NOT (novo termina antes do existente começar OU novo começa depois do existente terminar)
      if (!(fim <= agInicio || inicio >= agFim)) {
        throw this._erro('Horário não disponível: conflito com outro agendamento.', 409);
      }
    }
  }

  /**
   * Valida transições de status permitidas.
   * @param {string} atual
   * @param {string} novo
   */
  static #validarTransicao(atual, novo) {
    const TRANSICOES = {
      pending:     ['confirmed', 'cancelled'],
      confirmed:   ['in_progress', 'cancelled', 'no_show'],
      in_progress: ['done', 'cancelled'],
      done:        [],
      cancelled:   [],
      no_show:     [],
    };

    const permitidos = TRANSICOES[atual] ?? [];
    if (!permitidos.includes(novo)) {
      throw Object.assign(
        new Error(`Transição inválida: "${atual}" → "${novo}". Permitidos: ${permitidos.join(', ') || 'nenhum'}.`),
        { status: 422 }
      );
    }
  }
}

module.exports = AgendamentoService;
