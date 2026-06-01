'use strict';

// =============================================================================
// DataProcessor.js — Pipeline de validação, sanitização e normalização (POO)
// Compartilhado entre app cliente e app profissional
//
// Responsabilidades:
//   - Validar campos com retorno do VALOR NORMALIZADO (delegado ao InputValidator)
//   - Sanitizar ENTRADA: remove padrões de injeção antes de ir ao banco
//   - Sanitizar SAÍDA:  remove caracteres espúrios que vieram do banco
//   - normalizeData():  normaliza um objeto inteiro por tipo de campo
//   - processInput():   pipeline completo de validação + sanitização de entrada
//   - processOutput():  pipeline completo de limpeza de saída com warnings
//
// DEPENDÊNCIA: InputValidator (deve estar no mesmo contexto global).
//
// Nota de segurança: O Supabase já usa queries parametrizadas (INSERT/UPDATE
// com valores passados como parâmetros). Esta classe é defesa em profundidade —
// garante que dados corrompidos ou inesperados nunca cheguem nem saiam do banco.
//
// Uso:
//   // Antes do banco
//   const { ok, errors, data } = DataProcessor.processInput(req.body);
//   if (!ok) return res.status(400).json({ errors });
//
//   // Após o banco
//   const { data: limpo, warnings } = DataProcessor.processOutput(resultado);
//   res.json(limpo);
// =============================================================================

class DataProcessor {

  // ── Padrões privados ───────────────────────────────────────────────────────

  /**
   * Chars perigosos para ENTRADA: padrões de SQL injection, null-byte, etc.
   * Remove: ; ' " # $ * null-byte, sequências -- e blocos de comentário
   */
  static #DIRTY_INPUT_RE = /[;'"#$*\x00]|--+|\/\*[\s\S]*?\*\//g;

  /**
   * Chars inválidos para SAÍDA: mantém apenas alfanumérico, acentuado,
   * @, espaço, ponto, vírgula, hífen, barra e parênteses.
   * Qualquer outro char é considerado espúrio (vindo corrompido do banco).
   */
  static #DIRTY_OUTPUT_RE = /[^\w\sÀ-ÿ@.,\-\/()]/g;

  /** Remove tudo que não é dígito. */
  static #ONLY_DIGITS_RE = /\D/g;

  // ── Helpers privados ───────────────────────────────────────────────────────

  /**
   * Retorna apenas os dígitos de uma string.
   * @param {string} str
   * @returns {string}
   */
  static #onlyDigits(str) {
    return (str ?? '').replace(DataProcessor.#ONLY_DIGITS_RE, '');
  }

  /**
   * Remove o código de país 55 de um número com 13 dígitos (55 + 11 dígitos).
   * Retorna o número inalterado se não começar com 55 ou tiver tamanho diferente.
   * @param {string} digits — somente dígitos
   * @returns {string}
   */
  static #removeCountryCode(digits) {
    if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
    if (digits.length === 12 && digits.startsWith('55')) return digits.slice(2);
    return digits;
  }

  /**
   * Normaliza email: trim + lowercase.
   * @param {string} email
   * @returns {string}
   */
  static #normalizeEmail(email) {
    return (email ?? '').trim().toLowerCase();
  }

  // ── Validação com retorno de valor normalizado ─────────────────────────────

  /**
   * Valida CPF e retorna o número normalizado (somente 11 dígitos).
   * Delega a lógica de dígito verificador ao InputValidator.
   *
   * @param {string} cpf — com ou sem máscara, com ou sem chars extras
   * @returns {{ ok: boolean, msg: string, valor: string }}
   *          valor = '52998224725' (somente dígitos, sem máscara)
   */
  static validateCPF(cpf) {
    const digits = DataProcessor.#onlyDigits(cpf ?? '');
    const r      = InputValidator.cpf(digits, true);
    if (!r.ok) return { ok: false, msg: r.msg, valor: '' };
    return { ok: true, msg: '', valor: digits };
  }

  /**
   * Valida e-mail e retorna o valor normalizado para lowercase.
   *
   * @param {string} email
   * @returns {{ ok: boolean, msg: string, valor: string }}
   *          valor = 'usuario@email.com'
   */
  static validateEmail(email) {
    const normalizado = DataProcessor.#normalizeEmail(email);
    const r           = InputValidator.email(normalizado);
    if (!r.ok) return { ok: false, msg: r.msg, valor: '' };
    return { ok: true, msg: '', valor: normalizado };
  }

  /**
   * Valida telefone brasileiro e retorna somente os dígitos sem código de país.
   * Aceita: com máscara, com código 55, com chars extras.
   *
   * @param {string} phone — formato livre
   * @returns {{ ok: boolean, msg: string, valor: string }}
   *          valor = '11912345678'
   */
  static validatePhone(phone) {
    const raw    = DataProcessor.#onlyDigits(phone ?? '');
    const digits = DataProcessor.#removeCountryCode(raw);
    const r      = InputValidator.telefone(digits, true);
    if (!r.ok) return { ok: false, msg: r.msg, valor: '' };
    return { ok: true, msg: '', valor: digits };
  }

  // ── Sanitização de entrada ─────────────────────────────────────────────────

  /**
   * Remove padrões de injeção de uma string de entrada antes de enviá-la ao banco.
   *
   * Remove: ; ' " # $ * null-byte, sequências -- e blocos de comentário.
   * Preserva: letras, acentos, números, @, ponto, vírgula, espaço, hífen, etc.
   *
   * ⚠️  O Supabase já usa queries parametrizadas — use este método como
   *     camada de defesa extra, nunca como única proteção.
   *
   * @param {string} str
   * @returns {string}
   */
  static sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(DataProcessor.#DIRTY_INPUT_RE, '');
  }

  /**
   * Remove caracteres espúrios de uma string recebida do banco de dados.
   *
   * Implementa fallback de segurança: se o banco retornar chars inesperados
   * (corrompimento, migração incorreta, dados legados), remove-os antes de
   * enviar ao frontend.
   *
   * Mantém: alfanumérico, acentuado (À-ÿ), @, espaço, . , - / ()
   * Remove: $ # * % e outros chars fora do charset acima.
   *
   * @param {string} str
   * @returns {string}
   */
  static sanitizeOutput(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(DataProcessor.#DIRTY_OUTPUT_RE, '');
  }

  // ── Normalização de objetos ────────────────────────────────────────────────

  /**
   * Normaliza todos os campos conhecidos de um objeto de dados.
   *
   * Campos tratados por tipo:
   *   cpf              → somente dígitos
   *   email            → lowercase + trim
   *   phone / telefone → somente dígitos sem código de país 55
   *   address / endereco → sanitizeInput
   *   demais strings   → sanitizeInput
   *   não-strings      → passam intactos
   *
   * Não valida — apenas normaliza o formato. Para validação, use processInput().
   * Não muta o objeto original — retorna um novo objeto.
   *
   * @param {object} data
   * @returns {object}
   */
  static normalizeData(data) {
    if (!data || typeof data !== 'object') return {};
    const result = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        result[key] = value;
        continue;
      }

      switch (key) {
        case 'cpf':
          result[key] = DataProcessor.#onlyDigits(value);
          break;

        case 'email':
          result[key] = DataProcessor.#normalizeEmail(value);
          break;

        case 'phone':
        case 'telefone':
          result[key] = DataProcessor.#removeCountryCode(DataProcessor.#onlyDigits(value));
          break;

        case 'address':
        case 'endereco':
          result[key] = DataProcessor.sanitizeInput(value);
          break;

        default:
          result[key] = DataProcessor.sanitizeInput(value);
          break;
      }
    }

    return result;
  }

  // ── Pipelines completos ────────────────────────────────────────────────────

  /**
   * Pipeline de entrada: valida E normaliza um objeto antes do banco.
   *
   * - Campos conhecidos (cpf, email, phone/telefone, address/endereco) são
   *   validados — erros são coletados em `errors` (não para no primeiro).
   * - Todos os campos string são sanitizados.
   * - Não-strings passam intactos.
   *
   * @param {object} data — objeto do req.body ou similar
   * @returns {{ ok: boolean, errors: object, data: object }}
   *          ok     = false se QUALQUER campo conhecido for inválido
   *          errors = { cpf: 'msg', email: 'msg', ... }
   *          data   = objeto normalizado (mesmo que ok=false, para uso em debug)
   */
  static processInput(data) {
    if (!data || typeof data !== 'object') {
      return { ok: false, errors: { _geral: 'Payload inválido.' }, data: {} };
    }

    const errors  = {};
    const result  = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        result[key] = value;
        continue;
      }

      switch (key) {
        case 'cpf': {
          const r = DataProcessor.validateCPF(value);
          if (!r.ok) errors[key] = r.msg;
          result[key] = r.ok ? r.valor : DataProcessor.#onlyDigits(value);
          break;
        }

        case 'email': {
          const r = DataProcessor.validateEmail(value);
          if (!r.ok) errors[key] = r.msg;
          result[key] = r.ok ? r.valor : DataProcessor.#normalizeEmail(value);
          break;
        }

        case 'phone':
        case 'telefone': {
          const r = DataProcessor.validatePhone(value);
          if (!r.ok) errors[key] = r.msg;
          result[key] = r.ok
            ? r.valor
            : DataProcessor.#removeCountryCode(DataProcessor.#onlyDigits(value));
          break;
        }

        case 'address':
        case 'endereco': {
          const r = InputValidator.textoLivre(value);
          if (!r.ok) errors[key] = r.msg;
          result[key] = DataProcessor.sanitizeInput(r.ok ? r.valor : value);
          break;
        }

        default:
          result[key] = DataProcessor.sanitizeInput(value);
          break;
      }
    }

    return { ok: Object.keys(errors).length === 0, errors, data: result };
  }

  /**
   * Pipeline de saída: limpa os dados recebidos do banco antes de enviá-los
   * ao frontend. Nunca lança exceção — apenas limpa e avisa.
   *
   * - Campos string são passados por sanitizeOutput().
   * - Se o valor original difere do valor limpo, um warning é gerado.
   * - Não-strings passam intactos.
   *
   * @param {object} data — objeto retornado pelo banco (Supabase)
   * @returns {{ data: object, warnings: string[] }}
   *          data     = objeto limpo para o frontend
   *          warnings = lista de campos que continham chars indesejados
   */
  static processOutput(data) {
    if (!data || typeof data !== 'object') {
      return { data: {}, warnings: [] };
    }

    const result   = {};
    const warnings = [];

    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        result[key] = value;
        continue;
      }

      const limpo = DataProcessor.sanitizeOutput(value);
      result[key] = limpo;

      if (limpo !== value.trim()) {
        warnings.push(`"${key}" continha caracteres inválidos e foi limpo`);
      }
    }

    return { data: result, warnings };
  }
}
