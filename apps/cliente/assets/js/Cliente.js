'use strict';

// =============================================================
// Cliente.js — Entidade de domínio para usuário com role='client'.
// Modela os dados do perfil do cliente logado.
// Sem dependências externas — apenas encapsula os dados do banco.
//
// Uso:
//   const cliente = Cliente.fromRow(row);
//   cliente.nome; // → 'João Silva'
//   cliente.isAtivo(); // → true
// =============================================================

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

  /**
   * @param {object} row — linha da tabela profiles
   */
  constructor(row) {
    this.#id          = row?.id          ?? null;
    this.#nome        = row?.full_name   ?? '';
    this.#telefone    = row?.phone       ?? null;
    this.#avatarPath  = row?.avatar_path ?? null;
    this.#endereco    = row?.address     ?? null;
    this.#cep         = row?.zip_code    ?? null;
    this.#nascimento  = row?.birth_date  ?? null;
    this.#genero      = row?.gender      ?? null;
    this.#ativo       = row?.is_active   ?? true;
    this.#criadoEm    = row?.created_at  ?? null;
  }

  /**
   * Cria uma instância de Cliente a partir de uma linha do banco.
   * @param {object} row
   * @returns {Cliente}
   */
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

  /** @returns {boolean} */
  isAtivo() { return this.#ativo === true; }

  /**
   * Retorna representação plana do cliente (útil para formulários e logs).
   * Não expõe dados sensíveis adicionais.
   * @returns {object}
   */
  toJSON() {
    return {
      id:          this.#id,
      nome:        this.#nome,
      telefone:    this.#telefone,
      avatarPath:  this.#avatarPath,
      endereco:    this.#endereco,
      cep:         this.#cep,
      nascimento:  this.#nascimento,
      genero:      this.#genero,
      ativo:       this.#ativo,
      criadoEm:    this.#criadoEm,
    };
  }
}
