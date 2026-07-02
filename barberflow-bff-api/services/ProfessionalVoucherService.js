'use strict';

const BaseService = require('./BaseService');

const VOUCHER_MESSAGES = {
  not_found: 'Esse voucher nao existe.',
  already_used: 'Esse voucher ja foi aplicado.',
  invalid: 'Esse voucher nao e valido.',
};

class ProfessionalVoucherService extends BaseService {
  #repo;

  constructor(repo) {
    super('ProfessionalVoucherService');
    this.#repo = repo;
  }

  async validar(body = {}) {
    const code = ProfessionalVoucherService.normalizarCodigo(body.code);
    if (!code) return this.#invalido('invalid');

    const voucher = await this.#repo.getByCode(code);
    if (!voucher) return this.#invalido('not_found');
    if (voucher.used_at || voucher.used_by) return this.#invalido('already_used');
    if (voucher.is_active !== true || this.#expirado(voucher.expires_at)) {
      return this.#invalido('invalid');
    }

    return {
      ok: true,
      valid: true,
      code: voucher.code,
      trialDays: Number(voucher.trial_days || 30),
      message: 'Voucher valido.',
    };
  }

  static normalizarCodigo(value) {
    const code = String(value ?? '').replace(/\s+/g, '').toUpperCase();
    return /^[A-Z0-9]{6}$/.test(code) ? code : null;
  }

  #expirado(expiresAt) {
    if (!expiresAt) return false;
    const ts = Date.parse(expiresAt);
    return Number.isFinite(ts) && ts <= Date.now();
  }

  #invalido(reason) {
    return {
      ok: false,
      valid: false,
      reason,
      message: VOUCHER_MESSAGES[reason] || VOUCHER_MESSAGES.invalid,
    };
  }
}

module.exports = ProfessionalVoucherService;
