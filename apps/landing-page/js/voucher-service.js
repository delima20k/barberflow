'use strict';

class VoucherService {
  static #UNAVAILABLE_MESSAGE = 'A campanha ainda não está conectada a uma API segura.';

  #enabled;
  #adapter;

  constructor({ enabled = false, adapter = null } = {}) {
    this.#enabled = enabled === true;
    this.#adapter = adapter;
  }

  async checkAvailability() {
    if (!this.#enabled) return this.#unavailable();
    return this.#callAdapter('checkAvailability');
  }

  async generateVoucher(data) {
    if (!this.#enabled) return this.#unavailable();
    return this.#callAdapter('generateVoucher', data);
  }

  async validateVoucher(code) {
    if (!this.#enabled) return this.#unavailable();
    return this.#callAdapter('validateVoucher', code);
  }

  async #callAdapter(method, payload) {
    if (typeof this.#adapter?.[method] !== 'function') {
      throw new Error('O adapter seguro de vouchers não foi configurado.');
    }
    return this.#adapter[method](payload);
  }

  #unavailable() {
    return {
      ok: false,
      status: 'unavailable',
      remaining: null,
      mode: 'development',
      message: VoucherService.#UNAVAILABLE_MESSAGE,
    };
  }
}

globalThis.VoucherService = VoucherService;
