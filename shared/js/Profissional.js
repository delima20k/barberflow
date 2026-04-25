'use strict';

// =============================================================
// Profissional.js — Entidade de domínio de profissional
// Camada: domain
//
// Responsabilidades:
//   - Encapsular dados de um profissional (barbeiro/cabeleireiro)
//   - Validar campos obrigatórios e role permitido
//   - Fornecer métodos de consulta de estado
//
// Princípio: sem dependências externas (sem ApiService, Supabase, DOM).
// Uso:
//   const p = Profissional.fromRow(row);
//   const { ok, erros } = p.validar();
// =============================================================

class Profissional {

  static #ROLES_VALIDOS = ['barber', 'owner', 'manager'];

  // ── Campos privados ───────────────────────────────────────
  #id;
  #userId;
  #barbershopId;
  #fullName;
  #role;
  #isActive;

  constructor({ id, user_id, barbershop_id, full_name, role, is_active } = {}) {
    this.#id           = id            ?? null;
    this.#userId       = user_id       ?? null;
    this.#barbershopId = barbershop_id ?? null;
    this.#fullName     = full_name     ?? '';
    this.#role         = role          ?? '';
    this.#isActive     = is_active     ?? true;
  }

  // ── Getters públicos ──────────────────────────────────────
  get id()           { return this.#id;           }
  get userId()       { return this.#userId;       }
  get barbershopId() { return this.#barbershopId; }
  get fullName()     { return this.#fullName;     }
  get role()         { return this.#role;         }
  get isActive()     { return this.#isActive;     }

  // ── Factory ───────────────────────────────────────────────

  /**
   * Cria um Profissional a partir de uma linha do banco de dados.
   * @param {object} row
   * @returns {Profissional}
   */
  static fromRow(row) {
    return new Profissional(row ?? {});
  }

  // ── Validação ─────────────────────────────────────────────

  /**
   * Valida os campos do profissional.
   * @returns {{ ok: boolean, erros: string[] }}
   */
  validar() {
    const erros = [];

    if (!this.#userId)
      erros.push('ID de usuário é obrigatório.');

    if (!this.#fullName?.trim())
      erros.push('Nome completo é obrigatório.');

    if (!this.#role)
      erros.push('Role é obrigatório.');
    else if (!Profissional.#ROLES_VALIDOS.includes(this.#role))
      erros.push(`Role inválido: "${this.#role}". Permitidos: ${Profissional.#ROLES_VALIDOS.join(', ')}.`);

    return { ok: erros.length === 0, erros };
  }

  // ── Consultas de estado ───────────────────────────────────

  /** Retorna true se o profissional está ativo. */
  isAtivo() {
    return this.#isActive === true;
  }

  // ── Serialização ──────────────────────────────────────────

  /**
   * Serializa para objeto plano (compatível com banco de dados).
   * @returns {object}
   */
  toJSON() {
    return {
      id            : this.#id,
      user_id       : this.#userId,
      barbershop_id : this.#barbershopId,
      full_name     : this.#fullName,
      role          : this.#role,
      is_active     : this.#isActive,
    };
  }
}
