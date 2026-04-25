'use strict';

// =============================================================
// Cliente.js — Entidade de domínio para usuário com role='client'.
// Modela os dados do perfil do cliente e encapsula regras da entidade.
//
// Dependências: InputValidator.js (carregado antes)
//
// Uso:
//   const c = Cliente.fromRow(row);
//   const { ok, erros } = c.validar();
//   c.nomeCompleto(); // → 'João Silva'
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

  // ── Validação ─────────────────────────────────────────────

  /**
   * Valida os dados da entidade sem lançar exceção.
   * Regras:
   *   - nome obrigatório (mínimo 2 caracteres)
   *   - telefone, quando presente, deve ter formato BR (DDD + número)
   * @returns {{ ok: boolean, erros: string[] }}
   */
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

  /**
   * Retorna o nome com espaços extras removidos e letra maiúscula após espaço.
   * @returns {string}
   */
  nomeCompleto() {
    return (this.#nome ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((p) => p.length ? p[0].toUpperCase() + p.slice(1) : p)
      .join(' ');
  }

  /**
   * Indica se o cliente possui CEP cadastrado (usado como fallback de geolocalização).
   * @returns {boolean}
   */
  possuiLocalizacao() {
    return this.#cep !== null && this.#cep !== '';
  }

  /**
   * Representação plana da entidade (útil para formulários e logs).
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
