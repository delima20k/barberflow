'use strict';

// =============================================================
// InputValidator.js — Validação e sanitização centralizada (POO)
// Compartilhado entre app cliente e app profissional
//
// Responsabilidades:
//   - Validar campos de formulários (email, senha, nome, etc.)
//   - Validar documentos fiscais (CPF, CNPJ)
//   - Sanitizar strings contra XSS
//   - Validar UUIDs vindos de parâmetros
//
// Princípio: cada método retorna { ok: boolean, msg: string }
// Uso:
//   const r = InputValidator.email('user@mail.com');
//   if (!r.ok) mostrarErro(r.msg);
// =============================================================

class InputValidator {

  // ── Padrões ───────────────────────────────────────────────
  static #EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  static #UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  static #PHONE_REGEX = /^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/;

  // ── Campos básicos ────────────────────────────────────────

  /**
   * Valida e-mail.
   * @param {string} email
   * @returns {{ ok: boolean, msg: string }}
   */
  static email(email) {
    const v = email?.trim() ?? '';
    if (!v)                                  return { ok: false, msg: 'E-mail obrigatório.' };
    if (!InputValidator.#EMAIL_REGEX.test(v)) return { ok: false, msg: 'Digite um e-mail válido.' };
    if (v.length > 254)                      return { ok: false, msg: 'E-mail muito longo.' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida senha.
   * @param {string} senha
   * @param {number} [minLen=6]
   * @returns {{ ok: boolean, msg: string }}
   */
  static senha(senha, minLen = 6) {
    if (!senha)                  return { ok: false, msg: 'Senha obrigatória.' };
    if (senha.length < minLen)   return { ok: false, msg: `Senha deve ter no mínimo ${minLen} caracteres.` };
    if (senha.length > 128)      return { ok: false, msg: 'Senha muito longa.' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida se duas senhas coincidem.
   * @param {string} s1
   * @param {string} s2
   * @returns {{ ok: boolean, msg: string }}
   */
  static senhasConferem(s1, s2) {
    if (s1 !== s2) return { ok: false, msg: 'As senhas não coincidem.' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida nome (sem caracteres perigosos, comprimento mínimo).
   * @param {string} nome
   * @param {number} [minLen=2]
   * @returns {{ ok: boolean, msg: string }}
   */
  static nome(nome, minLen = 2) {
    const v = nome?.trim() ?? '';
    if (!v || v.length < minLen) return { ok: false, msg: 'Nome obrigatório.' };
    if (v.length > 100)          return { ok: false, msg: 'Nome muito longo.' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida telefone brasileiro (formato livre: ddd + número).
   * @param {string} telefone
   * @param {boolean} [obrigatorio=false]
   * @returns {{ ok: boolean, msg: string }}
   */
  static telefone(telefone, obrigatorio = false) {
    const v = telefone?.trim() ?? '';
    if (!v && !obrigatorio) return { ok: true, msg: '' };
    if (!v && obrigatorio)  return { ok: false, msg: 'Telefone obrigatório.' };
    const digits = v.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11)
      return { ok: false, msg: 'Telefone inválido (ex: (11) 91234-5678).' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida UUID v1–v5 (RFC 4122).
   * @param {string} id
   * @returns {{ ok: boolean, msg: string }}
   */
  static uuid(id) {
    if (!id || !InputValidator.#UUID_REGEX.test(id))
      return { ok: false, msg: 'Identificador inválido.' };
    return { ok: true, msg: '' };
  }

  // ── Documentos fiscais ────────────────────────────────────

  /**
   * Valida CPF (formato e dígito verificador).
   * @param {string} cpf
   * @param {boolean} [obrigatorio=false]
   * @returns {{ ok: boolean, msg: string }}
   */
  static cpf(cpf, obrigatorio = false) {
    const v = (cpf ?? '').replace(/\D/g, '');
    if (!v && !obrigatorio) return { ok: true, msg: '' };
    if (!v && obrigatorio)  return { ok: false, msg: 'CPF obrigatório.' };
    if (v.length !== 11 || /^(\d)\1{10}$/.test(v))
      return { ok: false, msg: 'CPF inválido.' };

    const calc = (pos) => {
      let sum = 0;
      for (let i = 0; i < pos - 1; i++) sum += parseInt(v[i]) * (pos - i);
      const rem = (sum * 10) % 11;
      return rem === 10 || rem === 11 ? 0 : rem;
    };
    if (calc(10) !== parseInt(v[9]) || calc(11) !== parseInt(v[10]))
      return { ok: false, msg: 'CPF inválido.' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida CNPJ (formato e dígito verificador).
   * @param {string} cnpj
   * @param {boolean} [obrigatorio=false]
   * @returns {{ ok: boolean, msg: string }}
   */
  static cnpj(cnpj, obrigatorio = false) {
    const v = (cnpj ?? '').replace(/\D/g, '');
    if (!v && !obrigatorio) return { ok: true, msg: '' };
    if (!v && obrigatorio)  return { ok: false, msg: 'CNPJ obrigatório.' };
    if (v.length !== 14 || /^(\d)\1{13}$/.test(v))
      return { ok: false, msg: 'CNPJ inválido.' };

    const calcDigito = (str, pesos) => {
      const sum = str.split('').reduce((acc, d, i) => acc + parseInt(d) * pesos[i], 0);
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    };
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    if (calcDigito(v.slice(0, 12), p1) !== parseInt(v[12]))
      return { ok: false, msg: 'CNPJ inválido.' };
    if (calcDigito(v.slice(0, 13), p2) !== parseInt(v[13]))
      return { ok: false, msg: 'CNPJ inválido.' };
    return { ok: true, msg: '' };
  }

  // ── Sanitização XSS ───────────────────────────────────────

  /**
   * Sanitiza string para exibição segura em HTML (previne XSS).
   * Use SEMPRE antes de inserir dados do usuário via innerHTML.
   * @param {string} str
   * @returns {string}
   */
  /**
   * Codifica caracteres especiais de HTML para uso seguro em **innerHTML**.
   *
   * ⚠️  REGRAS DE USO — leia antes de usar:
   *   ✅  CORRETO → element.innerHTML = sanitizar(dado)
   *   ❌  ERRADO  → element.textContent = sanitizar(dado)
   *       (textContent já é seguro por natureza; sanitizar() causaria
   *        "D'Água" virar "D&#x27;Água" visível na tela)
   *   ❌  ERRADO  → salvar sanitizar(dado) no banco de dados
   *       (o banco deve guardar o texto original; o Supabase/PostgREST usa
   *        queries parametrizadas e não tem risco de SQL injection aqui;
   *        use textoLivre() para validar antes de inserir)
   *
   * @param {string} str — texto a codificar
   * @returns {string}   — texto com &amp; < > " ' / escapados para HTML
   */
  static sanitizar(str) {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // ── Validação de dados da camada de persistência ──────────

  /**
   * Valida e sanitiza texto livre (mensagens, notas, bio, endereços).
   *
   * ✅  Use ANTES de salvar no banco de dados — retorna o texto original limpo.
   * ✅  Use ANTES de exibir via textContent (o valor já é seguro).
   * ❌  NÃO use sanitizar() para banco — retorna texto HTML-encoded, que seria
   *     armazenado com entidades como D&#x27;Água em vez de D'Água.
   *
   * Remove null-bytes (previne ataques de truncamento de string no banco).
   * Strings com aspas e "--" são aceitas — o Supabase/PostgREST usa queries
   * parametrizadas e NUNCA interpola o valor diretamente no SQL.
   *
   * @param {string}  str
   * @param {number}  [maxLen=500]
   * @param {boolean} [obrigatorio=false]
   * @returns {{ ok: boolean, msg: string, valor: string }}
   *          valor = texto original limpo (sem HTML encoding)
   */
  static textoLivre(str, maxLen = 500, obrigatorio = false) {
    // Remove null-bytes (U+0000) que podem causar truncamento inesperado
    const v = (str ?? '').replace(/\0/g, '').trim();
    if (!v && obrigatorio) return { ok: false, msg: 'Campo obrigatório.',              valor: '' };
    if (v.length > maxLen) return { ok: false, msg: `Máximo de ${maxLen} caracteres.`, valor: '' };
    return { ok: true, msg: '', valor: v };
  }

  /**
   * Valida par de coordenadas geográficas decimais.
   * Previne passagem de NaN/Infinity para cálculos de bounding-box.
   * @param {number} lat  — latitude  (-90 a 90)
   * @param {number} lng  — longitude (-180 a 180)
   * @returns {{ ok: boolean, msg: string }}
   */
  static coordenada(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        !isFinite(lat) || !isFinite(lng))
      return { ok: false, msg: 'Coordenadas inválidas (tipo ou valor não finito).' };
    if (lat < -90  || lat > 90)  return { ok: false, msg: 'Latitude fora do intervalo (-90 a 90).' };
    if (lng < -180 || lng > 180) return { ok: false, msg: 'Longitude fora do intervalo (-180 a 180).' };
    return { ok: true, msg: '' };
  }

  /**
   * Valida número inteiro positivo com limite máximo.
   * Usado para parâmetros de paginação e limites de query.
   * @param {number}  n
   * @param {number} [max=1000]
   * @returns {{ ok: boolean, msg: string }}
   */
  static intPositivo(n, max = 1000) {
    if (!Number.isInteger(n) || n < 1)
      return { ok: false, msg: 'Deve ser um inteiro maior que zero.' };
    if (n > max)
      return { ok: false, msg: `Valor máximo permitido: ${max}.` };
    return { ok: true, msg: '' };
  }

  /**
   * Verifica se um valor pertence a uma allowlist de strings (enum de domínio).
   * Previne que strings arbitrárias sejam aceitas em campos de status/tipo,
   * inclusive strings de SQL injection.
   * @param {string}   valor
   * @param {string[]} opcoes — allowlist de valores aceitos
   * @returns {{ ok: boolean, msg: string }}
   */
  static enumValido(valor, opcoes) {
    if (!opcoes.includes(valor))
      return { ok: false, msg: `"${String(valor)}" não é um valor permitido.` };
    return { ok: true, msg: '' };
  }

  /**
   * Filtra um objeto mantendo apenas os campos da allowlist.
   * Previne mass assignment — campos extras são descartados silenciosamente.
   * Retorna erro se o objeto filtrado estiver vazio (nenhum campo permitido).
   * @param {object}   obj
   * @param {string[]} camposPermitidos
   * @returns {{ ok: boolean, msg: string, valor: object }}
   */
  static payload(obj, camposPermitidos) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj))
      return { ok: false, msg: 'Payload inválido.', valor: {} };

    const filtrado = {};
    for (const campo of camposPermitidos) {
      if (campo in obj) filtrado[campo] = obj[campo];
    }

    if (Object.keys(filtrado).length === 0)
      return { ok: false, msg: 'Nenhum campo permitido informado.', valor: {} };

    return { ok: true, msg: '', valor: filtrado };
  }

  /**
   * Testa múltiplas validações em sequência.
   * Retorna o primeiro erro encontrado ou { ok: true } se tudo passar.
   * @param {Array<{ ok: boolean, msg: string }>} validacoes
   * @returns {{ ok: boolean, msg: string }}
   */
  static todos(validacoes) {
    for (const r of validacoes) {
      if (!r.ok) return r;
    }
    return { ok: true, msg: '' };
  }
}
