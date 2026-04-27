'use strict';

// =============================================================
// Agendamento.js — Entidade de domínio de agendamento.
// Camada: domain
//
// Sem dependências de framework ou banco de dados.
// Adaptado de shared/js/Agendamento.js para uso em Node.js.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class Agendamento {

  static #STATUS_VALIDOS = [
    'pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show',
  ];

  #id;
  #clientId;
  #professionalId;
  #barbershopId;
  #serviceId;
  #scheduledAt;
  #durationMin;
  #status;
  #notes;
  #priceCharged;

  /** @param {object} row — linha da tabela appointments */
  constructor(row) {
    this.#id             = row?.id              ?? null;
    this.#clientId       = row?.client_id       ?? null;
    this.#professionalId = row?.professional_id ?? null;
    this.#barbershopId   = row?.barbershop_id   ?? null;
    this.#serviceId      = row?.service_id      ?? null;
    this.#scheduledAt    = row?.scheduled_at ? new Date(row.scheduled_at) : null;
    this.#durationMin    = row?.duration_min    ?? null;
    this.#status         = row?.status          ?? 'pending';
    this.#notes          = row?.notes           ?? null;
    this.#priceCharged   = row?.price_charged   ?? null;
  }

  /** @param {object} row @returns {Agendamento} */
  static fromRow(row) {
    return new Agendamento(row);
  }

  /** @returns {string[]} */
  static get statusValidos() {
    return [...Agendamento.#STATUS_VALIDOS];
  }

  // ── Getters ───────────────────────────────────────────────
  get id()             { return this.#id; }
  get clientId()       { return this.#clientId; }
  get professionalId() { return this.#professionalId; }
  get barbershopId()   { return this.#barbershopId; }
  get serviceId()      { return this.#serviceId; }
  get scheduledAt()    { return this.#scheduledAt; }
  get durationMin()    { return this.#durationMin; }
  get status()         { return this.#status; }
  get notes()          { return this.#notes; }
  get priceCharged()   { return this.#priceCharged; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    for (const [campo, valor] of [
      ['client_id',       this.#clientId],
      ['professional_id', this.#professionalId],
      ['barbershop_id',   this.#barbershopId],
      ['service_id',      this.#serviceId],
    ]) {
      const r = InputValidator.uuid(valor);
      if (!r.ok) erros.push(`${campo}: ${r.msg}`);
    }

    if (!(this.#scheduledAt instanceof Date) || isNaN(this.#scheduledAt.getTime())) {
      erros.push('scheduled_at: data inválida.');
    } else if (this.#scheduledAt <= new Date()) {
      erros.push('scheduled_at: deve ser uma data futura.');
    }

    if (this.#durationMin === null || this.#durationMin === undefined) {
      erros.push('duration_min: obrigatório.');
    } else if (!Number.isInteger(this.#durationMin) || this.#durationMin < 1 || this.#durationMin > 480) {
      erros.push('duration_min: deve ser inteiro entre 1 e 480.');
    }

    const rStatus = InputValidator.enumValido(this.#status, Agendamento.#STATUS_VALIDOS);
    if (!rStatus.ok) erros.push(`status: ${rStatus.msg}`);

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isFuturo() {
    return this.#scheduledAt instanceof Date && this.#scheduledAt > new Date();
  }

  /** @returns {boolean} */
  isPendente() { return this.#status === 'pending'; }

  /** @returns {boolean} */
  isConfirmado() { return this.#status === 'confirmed'; }

  /** @returns {boolean} */
  isCancelado() { return this.#status === 'cancelled'; }

  /** @returns {boolean} */
  isConcluido() { return this.#status === 'done'; }

  /** @returns {object} */
  toJSON() {
    return {
      id:              this.#id,
      client_id:       this.#clientId,
      professional_id: this.#professionalId,
      barbershop_id:   this.#barbershopId,
      service_id:      this.#serviceId,
      scheduled_at:    this.#scheduledAt?.toISOString() ?? null,
      duration_min:    this.#durationMin,
      status:          this.#status,
      notes:           this.#notes,
      price_charged:   this.#priceCharged,
    };
  }
}

module.exports = Agendamento;
