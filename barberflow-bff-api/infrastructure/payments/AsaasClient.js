'use strict';

const AppError = require('../../utils/AppError');

class AsaasClient {
  #apiKey;
  #baseUrl;
  #timeoutMs;
  #fetch;

  constructor({
    apiKey = process.env.ASAAS_API_KEY,
    baseUrl = process.env.ASAAS_BASE_URL,
    env = process.env.ASAAS_ENV,
    timeoutMs = Number(process.env.ASAAS_TIMEOUT_MS ?? 60000),
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.#apiKey = apiKey ?? '';
    this.#baseUrl = this.#normalizarBaseUrl(baseUrl, env);
    this.#timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000;
    this.#fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.#apiKey && this.#baseUrl && typeof this.#fetch === 'function');
  }

  async criarCliente(payload) {
    return this.#request('/v3/customers', {
      method: 'POST',
      body: payload,
    });
  }

  async criarCobranca(payload) {
    return this.#request('/v3/payments', {
      method: 'POST',
      body: payload,
    });
  }

  async buscarPixQrCode(paymentId) {
    return this.#request(`/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {
      method: 'GET',
    });
  }

  async #request(path, { method = 'GET', body = null } = {}) {
    if (!this.configured) {
      throw AppError.unavailable('Asaas nao configurado no BFF.');
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          access_token: this.#apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new AppError('Nao foi possivel processar a cobranca no Asaas.', res.status >= 500 ? 502 : 400);
        err.asaasStatus = res.status;
        err.asaasMessage = this.#mensagemErro(json, res.status);
        throw err;
      }
      return json;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw AppError.unavailable('Timeout ao chamar o Asaas.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  #normalizarBaseUrl(baseUrl, env) {
    const raw = String(baseUrl || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
    return String(env || '').toLowerCase() === 'production'
      ? 'https://api.asaas.com'
      : 'https://sandbox.asaas.com/api';
  }

  #mensagemErro(json, status) {
    const first = Array.isArray(json?.errors) ? json.errors[0] : null;
    return first?.description || json?.error || `Asaas retornou HTTP ${status}.`;
  }
}

module.exports = AsaasClient;
