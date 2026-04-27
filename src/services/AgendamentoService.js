'use strict';

// =============================================================
// AgendamentoService.js — Regras de negócio para agendamentos.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao AgendamentoRepository.
// Contém validação de negócio, regras de status e orquestração.
// =============================================================

const Agendamento    = require('../entities/Agendamento');
const InputValidator = require('../infra/InputValidator');

class AgendamentoService {

  #agendamentoRepository;

  /** @param {import('../repositories/AgendamentoRepository')} agendamentoRepository */
  constructor(agendamentoRepository) {
    this.#agendamentoRepository = agendamentoRepository;
  }

  /**
   * Lista agendamentos de um profissional em um período.
   * @param {string} professionalId
   * @param {Date|string} inicio
   * @param {Date|string} fim
   * @returns {Promise<Agendamento[]>}
   */
  async listarPorProfissional(professionalId, inicio, fim) {
    const rId = InputValidator.uuid(professionalId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const dtInicio = new Date(inicio);
    const dtFim    = new Date(fim);

    if (isNaN(dtInicio.getTime()) || isNaN(dtFim.getTime()))
      throw Object.assign(new Error('Datas de início e fim inválidas.'), { status: 400 });

    if (dtInicio > dtFim)
      throw Object.assign(new Error('Data de início deve ser anterior à data de fim.'), { status: 400 });

    const rows = await this.#agendamentoRepository.getByProfissional(professionalId, dtInicio, dtFim);
    return rows.map(r => Agendamento.fromRow(r));
  }

  /**
   * Lista agendamentos de um cliente.
   * @param {string} clientId
   * @returns {Promise<Agendamento[]>}
   */
  async listarPorCliente(clientId) {
    const rId = InputValidator.uuid(clientId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const rows = await this.#agendamentoRepository.getByCliente(clientId);
    return rows.map(r => Agendamento.fromRow(r));
  }

  /**
   * Cria um novo agendamento após validação completa.
   * @param {object} dados
   * @returns {Promise<Agendamento>}
   */
  async criarAgendamento(dados) {
    // Valida via entidade (inclui regras de domínio)
    const ag = Agendamento.fromRow(dados);
    const { ok, erros } = ag.validar();
    if (!ok) throw Object.assign(new Error(erros.join('; ')), { status: 400 });

    const row = await this.#agendamentoRepository.criar(dados);
    return Agendamento.fromRow(row);
  }

  /**
   * Atualiza o status de um agendamento.
   * Aplica regras de transição de estados válidos.
   * @param {string} id
   * @param {string} novoStatus
   * @param {string} userId — ID do usuário autenticado
   * @returns {Promise<Agendamento>}
   */
  async atualizarStatus(id, novoStatus, userId) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const rStatus = InputValidator.enumValido(novoStatus, Agendamento.statusValidos);
    if (!rStatus.ok) throw Object.assign(new Error(`status: ${rStatus.msg}`), { status: 400 });

    // Busca atual para verificar regras de transição
    const atual = await this.#agendamentoRepository.getById(id);
    if (!atual) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 });

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
