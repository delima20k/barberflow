'use strict';

const AppError = require('../../utils/AppError');
const { logger } = require('../../middlewares/logger');

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

  async atualizarCliente(customerId, payload) {
    return this.#request(`/v3/customers/${encodeURIComponent(customerId)}`, {
      method: 'PUT',
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
        const asaasMessage = this.#mensagemErro(json, res.status);
        logger.warn(
          { status: res.status, message: asaasMessage, path, method },
          '[AsaasClient] request rejeitada pelo Asaas',
        );
        const err = this.#erroHttp(res.status, asaasMessage);
        err.asaasStatus = res.status;
        err.asaasMessage = asaasMessage;
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

  #erroHttp(status, asaasMessage) {
    if (status === 401 || status === 403) {
      return AppError.unavailable('Asaas recusou a credencial da BFF. Verifique ASAAS_API_KEY e ambiente.');
    }
    if (status >= 500) {
      return new AppError('Asaas indisponivel no momento.', 502);
    }
    return AppError.badRequest(`Asaas rejeitou a cobranca: ${this.#mensagemPublica(asaasMessage)}`);
  }

  #mensagemPublica(message) {
    const text = String(message || 'dados invalidos.')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return text || 'dados invalidos.';
  }
}

module.exports = AsaasClient;
