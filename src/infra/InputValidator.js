'use strict';

// =============================================================
// InputValidator.js — Validação centralizada para o backend Node.js.
//
// Adaptado de shared/js/InputValidator.js (browser).
// Mesma interface: cada método retorna { ok: boolean, msg: string }.
// =============================================================

class InputValidator {

  static #EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  static #UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  static #PHONE_REGEX = /^\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}$/;

  /** @returns {{ ok: boolean, msg: string }} */
  static email(email) {
    const v = email?.trim() ?? '';
    if (!v)                                  return { ok: false, msg: 'E-mail obrigatório.' };
    if (!InputValidator.#EMAIL_REGEX.test(v)) return { ok: false, msg: 'Digite um e-mail válido.' };
    if (v.length > 254)                      return { ok: false, msg: 'E-mail muito longo.' };
    return { ok: true, msg: '' };
  }

  /** @returns {{ ok: boolean, msg: string }} */
  static nome(nome, minLen = 2) {
    const v = nome?.trim() ?? '';
    if (!v || v.length < minLen) return { ok: false, msg: 'Nome obrigatório.' };
    if (v.length > 100)          return { ok: false, msg: 'Nome muito longo.' };
    return { ok: true, msg: '' };
  }

  /** @returns {{ ok: boolean, msg: string }} */
  static telefone(telefone, obrigatorio = false) {
    const v = telefone?.trim() ?? '';
    if (!v && !obrigatorio) return { ok: true,  msg: '' };
    if (!v && obrigatorio)  return { ok: false, msg: 'Telefone obrigatório.' };
    const digits = v.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11)
      return { ok: false, msg: 'Telefone inválido (ex: (11) 91234-5678).' };
    return { ok: true, msg: '' };
  }

  /** @returns {{ ok: boolean, msg: string }} */
  static uuid(id) {
    if (!id || !InputValidator.#UUID_REGEX.test(id))
      return { ok: false, msg: 'Identificador inválido.' };
    return { ok: true, msg: '' };
  }

  /** @returns {{ ok: boolean, msg: string, valor: string }} */
  static textoLivre(str, maxLen = 500, obrigatorio = false) {
    const v = (str ?? '').replace(/\0/g, '').trim();
    if (!v && obrigatorio) return { ok: false, msg: 'Campo obrigatório.',              valor: '' };
    if (v.length > maxLen) return { ok: false, msg: `Máximo de ${maxLen} caracteres.`, valor: '' };
    return { ok: true, msg: '', valor: v };
  }

  /** @returns {{ ok: boolean, msg: string }} */
  static coordenada(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        !isFinite(lat) || !isFinite(lng))
      return { ok: false, msg: 'Coordenadas inválidas.' };
    if (lat < -90  || lat > 90)  return { ok: false, msg: 'Latitude fora do intervalo (-90 a 90).' };
    if (lng < -180 || lng > 180) return { ok: false, msg: 'Longitude fora do intervalo (-180 a 180).' };
    return { ok: true, msg: '' };
  }

  /** @returns {{ ok: boolean, msg: string }} */
  static enumValido(valor, opcoes) {
    if (!opcoes.includes(valor))
      return { ok: false, msg: `"${String(valor)}" não é um valor permitido.` };
    return { ok: true, msg: '' };
  }

  /**
   * Filtra objeto mantendo apenas campos da allowlist (previne mass assignment).
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
}

module.exports = InputValidator;
