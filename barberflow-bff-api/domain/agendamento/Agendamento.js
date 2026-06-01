'use strict';

const { BaseAggregateRoot }      = require('../shared/BaseAggregateRoot');
const { Result }                 = require('../shared/Result');
const { AgendamentoStatus }      = require('./AgendamentoStatus');
const { AgendamentoCriadoEvent } = require('./AgendamentoCriadoEvent');

/**
 * Agendamento — Agregado raiz do bounded context de agendamentos.
 *
 * Invariantes:
 *  - scheduledAt deve ser no futuro no momento da criação.
 *  - Apenas transições válidas da máquina de estados são permitidas.
 *  - clienteId, profissionalId e serviceId são obrigatórios.
 */
class Agendamento extends BaseAggregateRoot {
  /** @type {string}            */ #clienteId;
  /** @type {string}            */ #profissionalId;
  /** @type {string}            */ #barbershopId;
  /** @type {string}            */ #serviceId;
  /** @type {Date}              */ #scheduledAt;
  /** @type {AgendamentoStatus} */ #status;
  /** @type {string|null}       */ #notes;

  /**
   * @private — use Agendamento.create() ou Agendamento.reconstitute()
   * @param {string}            id
   * @param {string}            clienteId
   * @param {string}            profissionalId
   * @param {string}            barbershopId
   * @param {string}            serviceId
   * @param {Date}              scheduledAt
   * @param {AgendamentoStatus} status
   * @param {string|null}       notes
   * @param {Date|string}       [createdAt]
   * @param {Date|string}       [updatedAt]
   */
  constructor(id, clienteId, profissionalId, barbershopId, serviceId, scheduledAt, status, notes, createdAt, updatedAt) {
    super(id, createdAt, updatedAt);
    this.#clienteId      = clienteId;
    this.#profissionalId = profissionalId;
    this.#barbershopId   = barbershopId;
    this.#serviceId      = serviceId;
    this.#scheduledAt    = scheduledAt;
    this.#status         = status;
    this.#notes          = notes ?? null;
  }

  // ── Factories ──────────────────────────────────────────────────

  /**
   * Cria um novo agendamento validando todas as invariantes.
   * @param {{ id: string, clienteId: string, profissionalId: string, barbershopId: string, serviceId: string, scheduledAt: Date, notes?: string }} dados
   * @returns {Result<Agendamento, string>}
   */
  static create(dados) {
    const { id, clienteId, profissionalId, barbershopId, serviceId, scheduledAt, notes } = dados;

    if (!id)            return Result.fail('Agendamento.create: id é obrigatório');
    if (!clienteId)     return Result.fail('Agendamento.create: clienteId é obrigatório');
    if (!profissionalId) return Result.fail('Agendamento.create: profissionalId é obrigatório');
    if (!barbershopId)  return Result.fail('Agendamento.create: barbershopId é obrigatório');
    if (!serviceId)     return Result.fail('Agendamento.create: serviceId é obrigatório');
    if (!(scheduledAt instanceof Date) || isNaN(scheduledAt)) {
      return Result.fail('Agendamento.create: scheduledAt deve ser uma Date válida');
    }
    if (scheduledAt <= new Date()) {
      return Result.fail('Agendamento.create: scheduledAt deve ser no futuro');
    }

    const statusResult = AgendamentoStatus.create('pending');
    if (statusResult.isFail()) return statusResult;

    const agendamento = new Agendamento(
      id, clienteId, profissionalId, barbershopId, serviceId,
      scheduledAt, statusResult.getValue(), notes ?? null,
    );

    agendamento._raise(new AgendamentoCriadoEvent(id, clienteId, profissionalId, scheduledAt));
    return Result.ok(agendamento);
  }

  /**
   * Reconstitui um agendamento a partir de dados persistidos (sem validar scheduledAt no futuro).
   * @param {{ id: string, clienteId: string, profissionalId: string, barbershopId: string, serviceId: string, scheduledAt: Date|string, status: string, notes?: string, createdAt?: Date|string, updatedAt?: Date|string }} dados
   * @returns {Result<Agendamento, string>}
   */
  static reconstitute(dados) {
    const statusResult = AgendamentoStatus.create(dados.status);
    if (statusResult.isFail()) return statusResult;

    return Result.ok(new Agendamento(
      dados.id,
      dados.clienteId,
      dados.profissionalId,
      dados.barbershopId,
      dados.serviceId,
      new Date(dados.scheduledAt),
      statusResult.getValue(),
      dados.notes ?? null,
      dados.createdAt,
      dados.updatedAt,
    ));
  }

  // ── Comportamento ──────────────────────────────────────────────

  /**
   * Tenta transicionar para o próximo status.
   * @param {import('./AgendamentoStatus').StatusValue} novoStatus
   * @returns {Result<void, string>}
   */
  atualizarStatus(novoStatus) {
    const resultado = this.#status.transicionarPara(novoStatus);
    if (resultado.isFail()) return resultado;
    this.#status = resultado.getValue();
    this._touch();
    return Result.ok();
  }

  // ── Getters ────────────────────────────────────────────────────

  get clienteId()      { return this.#clienteId; }
  get profissionalId() { return this.#profissionalId; }
  get barbershopId()   { return this.#barbershopId; }
  get serviceId()      { return this.#serviceId; }
  get scheduledAt()    { return new Date(this.#scheduledAt); }
  get status()         { return this.#status; }
  get notes()          { return this.#notes; }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {object} */
  toJSON() {
    return {
      ...super.toJSON(),
      clienteId:      this.#clienteId,
      profissionalId: this.#profissionalId,
      barbershopId:   this.#barbershopId,
      serviceId:      this.#serviceId,
      scheduledAt:    this.#scheduledAt.toISOString(),
      status:         this.#status.value,
      notes:          this.#notes,
    };
  }
}

module.exports = { Agendamento };
