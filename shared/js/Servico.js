'use strict';

// =============================================================
// Servico.js — Entidade de domínio de serviço (tipo de tratamento)
// Camada: domain
//
// Responsabilidades:
//   - Encapsular dados de um serviço oferecido por uma barbearia
//   - Validar campos obrigatórios, preço e duração
//   - Fornecer métodos de consulta de estado
//
// Princípio: sem dependências externas (sem ApiService, Supabase, DOM).
// Uso:
//   const s = Servico.fromRow(row);
//   const { ok, erros } = s.validar();
// =============================================================

class Servico {

  // ── Campos privados ───────────────────────────────────────
  #id;
  #barbershopId;
  #name;
  #price;
  #durationMin;
  #isActive;

  constructor({ id, barbershop_id, name, price, duration_min, is_active } = {}) {
    this.#id           = id            ?? null;
    this.#barbershopId = barbershop_id ?? null;
    this.#name         = name          ?? '';
    this.#price        = price         ?? null;
    this.#durationMin  = duration_min  ?? null;
    this.#isActive     = is_active     ?? true;
  }

  // ── Getters públicos ──────────────────────────────────────
  get id()           { return this.#id;           }
  get barbershopId() { return this.#barbershopId; }
  get name()         { return this.#name;         }
  get price()        { return this.#price;        }
  get durationMin()  { return this.#durationMin;  }
  get isActive()     { return this.#isActive;     }

  // ── Factory ───────────────────────────────────────────────

  /**
   * Cria um Servico a partir de uma linha do banco de dados.
   * @param {object} row
   * @returns {Servico}
   */
  static fromRow(row) {
    return new Servico(row ?? {});
  }

  // ── Validação ─────────────────────────────────────────────

  /**
   * Valida os campos do serviço.
   * @returns {{ ok: boolean, erros: string[] }}
   */
  validar() {
    const erros = [];

    if (!this.#name?.trim())
      erros.push('Nome do serviço é obrigatório.');

    if (!this.#barbershopId)
      erros.push('ID da barbearia é obrigatório.');

    if (this.#price !== null) {
      if (typeof this.#price !== 'number' || !isFinite(this.#price))
        erros.push('Preço deve ser um número válido.');
      else if (this.#price < 0)
        erros.push('Preço não pode ser negativo.');
    }

    if (this.#durationMin !== null) {
      if (!Number.isInteger(this.#durationMin) || this.#durationMin <= 0)
        erros.push('Duração deve ser um inteiro positivo (em minutos).');
    }

    return { ok: erros.length === 0, erros };
  }

  // ── Consultas de estado ───────────────────────────────────

  /** Retorna true se o serviço está ativo. */
  isAtivo() {
    return this.#isActive === true;
  }

  /** Retorna true se o serviço possui preço definido. */
  temPreco() {
    return this.#price !== null && typeof this.#price === 'number';
  }

  // ── Serialização ──────────────────────────────────────────

  /**
   * Serializa para objeto plano (compatível com banco de dados).
   * @returns {object}
   */
  toJSON() {
    return {
      id            : this.#id,
      barbershop_id : this.#barbershopId,
      name          : this.#name,
      price         : this.#price,
      duration_min  : this.#durationMin,
      is_active     : this.#isActive,
    };
  }
}
