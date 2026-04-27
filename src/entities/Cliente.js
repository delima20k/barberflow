'use strict';

// =============================================================
// Cliente.js — Entidade de domínio para usuário com role='client'.
// Camada: domain
//
// Sem dependências de framework ou banco de dados.
// Adaptado de shared/js/Cliente.js para uso em Node.js.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class Cliente {

  #id;
  #nome;
  #telefone;
  #avatarPath;
  #endereco;
  #cep;
  #nascimento;
  #genero;
  #ativo;
  #criadoEm;

  /** @param {object} row — linha da tabela profiles */
  constructor(row) {
    this.#id         = row?.id          ?? null;
    this.#nome       = row?.full_name   ?? '';
    this.#telefone   = row?.phone       ?? null;
    this.#avatarPath = row?.avatar_path ?? null;
    this.#endereco   = row?.address     ?? null;
    this.#cep        = row?.zip_code    ?? null;
    this.#nascimento = row?.birth_date  ?? null;
    this.#genero     = row?.gender      ?? null;
    this.#ativo      = row?.is_active   ?? true;
    this.#criadoEm   = row?.created_at  ?? null;
  }

  /** @param {object} row @returns {Cliente} */
  static fromRow(row) {
    return new Cliente(row);
  }

  // ── Getters ───────────────────────────────────────────────
  get id()         { return this.#id; }
  get nome()       { return this.#nome; }
  get telefone()   { return this.#telefone; }
  get avatarPath() { return this.#avatarPath; }
  get endereco()   { return this.#endereco; }
  get cep()        { return this.#cep; }
  get nascimento() { return this.#nascimento; }
  get genero()     { return this.#genero; }
  get criadoEm()   { return this.#criadoEm; }

  // ── Validação ─────────────────────────────────────────────

  /** @returns {{ ok: boolean, erros: string[] }} */
  validar() {
    const erros = [];

    const rNome = InputValidator.nome(this.#nome);
    if (!rNome.ok) erros.push(rNome.msg);

    if (this.#telefone !== null && this.#telefone !== '') {
      const rTel = InputValidator.telefone(this.#telefone);
      if (!rTel.ok) erros.push(rTel.msg);
    }

    return { ok: erros.length === 0, erros };
  }

  // ── Métodos de domínio ────────────────────────────────────

  /** @returns {boolean} */
  isAtivo() { return this.#ativo === true; }

  /** @returns {string} */
  nomeCompleto() {
    return (this.#nome ?? '').trim().replace(/\s+/g, ' ');
  }

  /** @returns {object} */
  toJSON() {
    return {
      id:          this.#id,
      full_name:   this.#nome,
      phone:       this.#telefone,
      avatar_path: this.#avatarPath,
      address:     this.#endereco,
      zip_code:    this.#cep,
      birth_date:  this.#nascimento,
      gender:      this.#genero,
      is_active:   this.#ativo,
      created_at:  this.#criadoEm,
    };
  }
}

module.exports = Cliente;
