'use strict';

const crypto = require('node:crypto');
const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');

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

  async consultarDisponibilidade() {
    const remaining = await this.#repo.countAvailable();
    return {
      ok: true,
      status: remaining > 0 ? 'available' : 'sold_out',
      remaining,
    };
  }

  async emitir(body = {}) {
    const company = ProfessionalVoucherService.#normalizarTexto(body.company, 120);
    if (company) return { ok: true, status: 'accepted' };

    const email = ProfessionalVoucherService.#normalizarTexto(body.email, 160).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw AppError.badRequest('Informe um e-mail valido.');
    }
    if (body.campaignConsent !== true) {
      throw AppError.badRequest('Aceite as regras da campanha para continuar.');
    }

    const issuance = await this.#repo.issueAvailableVoucher({
      emailHash: crypto.createHash('sha256').update(email).digest('hex'),
    });

    if (issuance?.result_status === 'issued'
      && /^[A-Z0-9]{6}$/.test(String(issuance.voucher_code ?? ''))) {
      return {
        ok: true,
        status: 'issued',
        code: issuance.voucher_code,
        trialDays: Number(issuance.voucher_trial_days || 30),
        remaining: Number(issuance.remaining_count || 0),
      };
    }

    const status = issuance?.result_status ?? 'unavailable';
    const messages = {
      duplicate_email: 'Este e-mail ja recebeu um voucher desta campanha.',
      sold_out: 'Os vouchers desta campanha se esgotaram.',
    };
    return {
      ok: false,
      status,
      remaining: Number.isInteger(issuance?.remaining_count)
        ? issuance.remaining_count
        : null,
      message: messages[status] ?? 'Nao foi possivel emitir o voucher agora.',
    };
  }

  static normalizarCodigo(value) {
    const code = String(value ?? '').replace(/\s+/g, '').toUpperCase();
    return /^[A-Z0-9]{6}$/.test(code) ? code : null;
  }

  static #normalizarTexto(value, maxLength) {
    return Array.from(String(value ?? ''))
      .filter((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint > 31 && codePoint !== 127;
      })
      .join('')
      .trim()
      .slice(0, maxLength);
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
