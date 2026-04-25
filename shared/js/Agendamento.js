'use strict';

// =============================================================
// Agendamento.js — Entidade de domínio para agendamentos.
// Modela um agendamento e encapsula regras da entidade:
// validação de campos, consultas de estado e comportamento.
//
// Dependências: InputValidator.js (carregado antes)
//
// Uso:
//   const ag = Agendamento.fromRow(row);
//   const { ok, erros } = ag.validar();
//   ag.isFuturo(); // → true
// =============================================================

class Agendamento {

  static #STATUS_VALIDOS = [
    'pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show',
  ];

  #id;
  #clientId;
  #professionalId;
  #barbershopId;
  #serviceId;
  #scheduledAt;   // Date
  #durationMin;
  #status;
  #notes;
  #priceCharged;

  /**
   * @param {object} row — linha da tabela appointments
   */
  constructor(row) {
    this.#id              = row?.id              ?? null;
    this.#clientId        = row?.client_id       ?? null;
    this.#professionalId  = row?.professional_id ?? null;
    this.#barbershopId    = row?.barbershop_id   ?? null;
    this.#serviceId       = row?.service_id      ?? null;
    this.#scheduledAt     = row?.scheduled_at
      ? new Date(row.scheduled_at)
      : null;
    this.#durationMin     = row?.duration_min    ?? null;
    this.#status          = row?.status          ?? 'pending';
    this.#notes           = row?.notes           ?? null;
    this.#priceCharged    = row?.price_charged   ?? null;
  }

  /**
   * Cria uma instância de Agendamento a partir de uma linha do banco.
   * @param {object} row
   * @returns {Agendamento}
   */
  static fromRow(row) {
    return new Agendamento(row);
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

  /**
   * Valida os dados da entidade sem lançar exceção.
   * Regras:
   *   - client_id, professional_id, barbershop_id, service_id — UUIDs obrigatórios
   *   - scheduledAt — Date válida e no futuro
   *   - durationMin — inteiro positivo entre 1 e 480
   *   - status — deve estar na allowlist
   * @returns {{ ok: boolean, erros: string[] }}
   */
  validar() {
    const erros = [];

    // UUIDs obrigatórios
    for (const [campo, valor] of [
      ['client_id',       this.#clientId],
      ['professional_id', this.#professionalId],
      ['barbershop_id',   this.#barbershopId],
      ['service_id',      this.#serviceId],
    ]) {
      const r = InputValidator.uuid(valor);
      if (!r.ok) erros.push(`${campo}: ${r.msg}`);
    }

    // Data: deve ser Date válida e futura
    if (!(this.#scheduledAt instanceof Date) || isNaN(this.#scheduledAt.getTime())) {
      erros.push('scheduled_at: data inválida.');
    } else if (this.#scheduledAt <= new Date()) {
      erros.push('scheduled_at: o agendamento deve ser no futuro.');
    }

    // Duração: inteiro positivo entre 1 e 480 minutos
    if (
      !Number.isInteger(this.#durationMin) ||
      this.#durationMin < 1 ||
      this.#durationMin > 480
    ) {
      erros.push('duration_min: deve ser um inteiro entre 1 e 480.');
    }

    // Status na allowlist
    if (!Agendamento.#STATUS_VALIDOS.includes(this.#status)) {
      erros.push(`status: "${this.#status}" não é um valor permitido.`);
    }

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de estado ─────────────────────────────────────

  /** @returns {boolean} */
  isPendente()   { return this.#status === 'pending'; }

  /** @returns {boolean} */
  isConfirmado() { return this.#status === 'confirmed'; }

  /** @returns {boolean} */
  isCancelado()  {
    return this.#status === 'cancelled' || this.#status === 'no_show';
  }

  /** @returns {boolean} */
  isConcluido()  { return this.#status === 'done'; }

  /**
   * Retorna true se o horário agendado ainda está no futuro.
   * @returns {boolean}
   */
  isFuturo() {
    return this.#scheduledAt instanceof Date &&
      !isNaN(this.#scheduledAt.getTime()) &&
      this.#scheduledAt > new Date();
  }

  /**
   * Representação plana da entidade (útil para logs e formulários).
   * @returns {object}
   */
  toJSON() {
    return {
      id:             this.#id,
      clientId:       this.#clientId,
      professionalId: this.#professionalId,
      barbershopId:   this.#barbershopId,
      serviceId:      this.#serviceId,
      scheduledAt:    this.#scheduledAt?.toISOString() ?? null,
      durationMin:    this.#durationMin,
      status:         this.#status,
      notes:          this.#notes,
      priceCharged:   this.#priceCharged,
    };
  }
}
