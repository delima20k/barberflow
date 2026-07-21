'use strict';

class FeedbackApiAdapter {
  static #ALLOWED_FIELDS = Object.freeze([
    'name',
    'email',
    'type',
    'subject',
    'message',
    'privacyConsent',
  ]);

  #endpoint;
  #fetch;

  constructor(endpoint, { fetchImpl = globalThis.fetch } = {}) {
    this.#endpoint = String(endpoint ?? '').trim();
    this.#fetch = fetchImpl;
  }

  async submit(payload = {}) {
    if (!this.#endpoint || typeof this.#fetch !== 'function') {
      return {
        ok: false,
        status: 'unavailable',
        message: 'O envio de sugestões está temporariamente indisponível.',
      };
    }

    const body = {};
    FeedbackApiAdapter.#ALLOWED_FIELDS.forEach((field) => {
      body[field] = payload[field];
    });

    try {
      const response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: globalThis.AbortSignal?.timeout?.(10_000),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result?.ok === false) {
        return {
          ok: false,
          status: 'error',
          message: result?.error ?? 'Não foi possível enviar sua sugestão agora.',
        };
      }

      return { ok: true, status: 'accepted' };
    } catch {
      return {
        ok: false,
        status: 'error',
        message: 'Não foi possível conectar ao BarberFlow. Tente novamente.',
      };
    }
  }
}

class FeedbackService {
  static #ALLOWED_TYPES = new Set([
    'Sugestão',
    'Melhoria',
    'Dúvida',
    'Problema',
    'Parceria',
    'Outro',
  ]);

  #enabled;
  #adapter;

  constructor(options = {}) {
    this.#enabled = options.enabled === true;
    this.#adapter = options.adapter ?? null;
  }

  async submit(data) {
    if (!this.#enabled) {
      return {
        ok: false,
        status: 'unavailable',
        mode: 'development',
        message: 'O envio seguro de sugestões ainda não está disponível.',
      };
    }

    const payload = this.normalize(data);
    this.validate(payload);

    if (!this.#adapter?.submit) {
      throw new Error('Um adapter seguro de feedback não foi configurado.');
    }

    return this.#adapter.submit(payload);
  }

  normalize(data = {}) {
    return {
      name: this.normalizeText(data.name, 80),
      email: this.normalizeText(data.email, 160).toLowerCase(),
      type: this.normalizeText(data.type, 24),
      subject: this.normalizeText(data.subject, 120),
      message: this.normalizeText(data.message, 1000),
      privacyConsent: data.privacyConsent === true,
    };
  }

  normalizeText(value, maxLength) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  validate(payload) {
    if (payload.name.length < 2) {
      throw new Error('Informe um nome válido.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      throw new Error('Informe um e-mail válido.');
    }
    if (!FeedbackService.#ALLOWED_TYPES.has(payload.type)) {
      throw new Error('Selecione um tipo da mensagem válido.');
    }
    if (payload.subject.length < 3) {
      throw new Error('Informe um assunto válido.');
    }
    if (payload.message.length < 10) {
      throw new Error('A mensagem deve ter pelo menos 10 caracteres.');
    }
    if (!payload.privacyConsent) {
      throw new Error('Aceite a política de privacidade para continuar.');
    }
  }
}

globalThis.FeedbackApiAdapter = FeedbackApiAdapter;
globalThis.FeedbackService = FeedbackService;
