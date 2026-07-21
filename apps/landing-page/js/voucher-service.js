'use strict';

class VoucherApiAdapter {
  static #ALLOWED_FIELDS = Object.freeze([
    'name',
    'email',
    'phone',
    'campaignConsent',
    'company',
  ]);

  #endpoint;
  #fetch;

  constructor(endpoint, { fetchImpl = globalThis.fetch } = {}) {
    this.#endpoint = String(endpoint ?? '').replace(/\/+$/, '');
    this.#fetch = fetchImpl;
  }

  async checkAvailability() {
    return this.#request('/availability');
  }

  async generateVoucher(payload = {}) {
    const body = {};
    VoucherApiAdapter.#ALLOWED_FIELDS.forEach((field) => {
      body[field] = payload[field];
    });
    return this.#request('/issue', { method: 'POST', body });
  }

  async validateVoucher(code) {
    return this.#request('/validate', { method: 'POST', body: { code } });
  }

  async #request(path, { method = 'GET', body = null } = {}) {
    if (!this.#endpoint || typeof this.#fetch !== 'function') {
      return {
        ok: false,
        status: 'unavailable',
        message: 'A campanha esta temporariamente indisponivel.',
      };
    }

    try {
      const fetchRequest = this.#fetch;
      const response = await fetchRequest(`${this.#endpoint}${path}`, {
        method,
        credentials: 'omit',
        ...(body ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        } : {}),
        signal: globalThis.AbortSignal?.timeout?.(10_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        return {
          ok: false,
          status: response.status === 429 ? 'rate_limited' : 'error',
          message: result?.error ?? 'Nao foi possivel acessar a campanha agora.',
        };
      }

      return result?.dados ?? {
        ok: false,
        status: 'error',
        message: 'A campanha retornou uma resposta invalida.',
      };
    } catch {
      return {
        ok: false,
        status: 'error',
        message: 'Nao foi possivel conectar ao BarberFlow. Tente novamente.',
      };
    }
  }
}

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

globalThis.VoucherApiAdapter = VoucherApiAdapter;
globalThis.VoucherService = VoucherService;
