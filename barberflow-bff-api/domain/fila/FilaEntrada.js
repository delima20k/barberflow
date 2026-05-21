'use strict';

const { BaseAggregateRoot } = require('../shared/BaseAggregateRoot');
const { Result }            = require('../shared/Result');
const { FilaStatus }        = require('./FilaStatus');
const { DomainEvent }       = require('../shared/DomainEvent');

/**
 * FilaEntradaCriadaEvent — Entrada na fila criada.
 * @extends {DomainEvent}
 */
class FilaEntradaCriadaEvent extends DomainEvent {
  /**
   * @param {string} entradaId
   * @param {string} barbershopId
   * @param {string} clienteId
   */
  constructor(entradaId, barbershopId, clienteId) {
    super('FilaEntradaCriada', entradaId);
    this.barbershopId = barbershopId;
    this.clienteId    = clienteId;
    Object.freeze(this);
  }
}

/**
 * FilaEntrada — Agregado raiz do bounded context de fila de espera.
 *
 * Invariantes:
 *  - Posição é >= 1.
 *  - clienteId e barbershopId são obrigatórios.
 *  - Confirmação de presença só é válida enquanto não terminal.
 */
class FilaEntrada extends BaseAggregateRoot {
  /** @type {string}         */ #barbershopId;
  /** @type {string}         */ #clienteId;
  /** @type {string|null}    */ #profissionalId;
  /** @type {string|null}    */ #serviceId;
  /** @type {number}         */ #posicao;
  /** @type {FilaStatus}     */ #status;
  /** @type {string|null}    */ #clienteConfirmado;

  /**
   * @private
   */
  constructor(id, barbershopId, clienteId, profissionalId, serviceId, posicao, status, clienteConfirmado, createdAt, updatedAt) {
    super(id, createdAt, updatedAt);
    this.#barbershopId      = barbershopId;
    this.#clienteId         = clienteId;
    this.#profissionalId    = profissionalId ?? null;
    this.#serviceId         = serviceId ?? null;
    this.#posicao           = posicao;
    this.#status            = status;
    this.#clienteConfirmado = clienteConfirmado ?? null;
  }

  // ── Factories ──────────────────────────────────────────────────

  /**
   * @param {{ id: string, barbershopId: string, clienteId: string, profissionalId?: string, serviceId?: string, posicao: number }} dados
   * @returns {Result<FilaEntrada, string>}
   */
  static create(dados) {
    const { id, barbershopId, clienteId, posicao } = dados;
    if (!id)          return Result.fail('FilaEntrada.create: id é obrigatório');
    if (!barbershopId) return Result.fail('FilaEntrada.create: barbershopId é obrigatório');
    if (!clienteId)   return Result.fail('FilaEntrada.create: clienteId é obrigatório');
    if (!Number.isInteger(posicao) || posicao < 1) {
      return Result.fail('FilaEntrada.create: posicao deve ser inteiro >= 1');
    }

    const entrada = new FilaEntrada(
      id, barbershopId, clienteId,
      dados.profissionalId ?? null, dados.serviceId ?? null,
      posicao, FilaStatus.initial(), null,
    );
    entrada._raise(new FilaEntradaCriadaEvent(id, barbershopId, clienteId));
    return Result.ok(entrada);
  }

  /**
   * Reconstitui de dados persistidos.
   * @param {object} dados
   * @returns {Result<FilaEntrada, string>}
   */
  static reconstitute(dados) {
    const statusResult = FilaStatus.create(dados.status);
    if (statusResult.isFail()) return statusResult;

    return Result.ok(new FilaEntrada(
      dados.id, dados.barbershopId, dados.clienteId,
      dados.profissionalId ?? null, dados.serviceId ?? null,
      dados.posicao, statusResult.getValue(),
      dados.clienteConfirmado ?? null,
      dados.createdAt, dados.updatedAt,
    ));
  }

  // ── Comportamento ──────────────────────────────────────────────

  /**
   * @param {import('./FilaStatus').FilaStatusValue} novoStatus
   * @returns {Result<void, string>}
   */
  atualizarStatus(novoStatus) {
    const resultado = this.#status.transicionarPara(novoStatus);
    if (resultado.isFail()) return resultado;
    this.#status = resultado.getValue();
    this._touch();
    return Result.ok();
  }

  /**
   * @param {import('./FilaStatus').ConfirmacaoValue} confirmacao
   * @returns {Result<void, string>}
   */
  confirmarPresenca(confirmacao) {
    const validos = ['yes', 'arriving', 'no_waiting', 'absent'];
    if (!validos.includes(confirmacao)) {
      return Result.fail(`confirmarPresenca: valor inválido "${confirmacao}". Esperado: ${validos.join(', ')}`);
    }
    if (this.#status.isTerminal()) {
      return Result.fail('confirmarPresenca: entrada já está em status terminal');
    }
    this.#clienteConfirmado = confirmacao;
    this._touch();
    return Result.ok();
  }

  // ── Getters ────────────────────────────────────────────────────

  get barbershopId()      { return this.#barbershopId; }
  get clienteId()         { return this.#clienteId; }
  get profissionalId()    { return this.#profissionalId; }
  get serviceId()         { return this.#serviceId; }
  get posicao()           { return this.#posicao; }
  get status()            { return this.#status; }
  get clienteConfirmado() { return this.#clienteConfirmado; }

  // ── Serialização ───────────────────────────────────────────────

  toJSON() {
    return {
      ...super.toJSON(),
      barbershopId:      this.#barbershopId,
      clienteId:         this.#clienteId,
      profissionalId:    this.#profissionalId,
      serviceId:         this.#serviceId,
      posicao:           this.#posicao,
      status:            this.#status.value,
      clienteConfirmado: this.#clienteConfirmado,
    };
  }
}

module.exports = { FilaEntrada, FilaEntradaCriadaEvent };
