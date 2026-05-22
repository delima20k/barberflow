'use strict';

/**
 * SentryClient — Integração com Sentry para captura de erros com contexto de domínio.
 *
 * Princípios:
 *   - Fail-open: se SENTRY_DSN não estiver configurado ou o pacote não instalado,
 *     nenhum erro é lançado — o sistema continua funcionando normalmente.
 *   - Zero PII: email, senha, token, telefone e IP do usuário NUNCA chegam ao Sentry.
 *   - Contexto de domínio: userId (hash/opaque), role, command, domain, traceId.
 *   - beforeSend: filtro de última linha para sanitização antes do envio.
 *
 * Variáveis de ambiente:
 *   SENTRY_DSN         — DSN do projeto Sentry (obrigatório para ativar)
 *   APP_ENV            — ambiente (development/staging/production)
 *   APP_VERSION        — release tag (ex: 1.2.3)
 *   SENTRY_SAMPLE_RATE — taxa de tracing (0.0–1.0, padrão: 0.1 em prod)
 */
class SentryClient {
  static #sentry      = null;
  static #initialized = false;

  /** Campos de PII que nunca devem ir ao Sentry */
  static #PII_FIELDS = new Set([
    'email', 'password', 'senha', 'token', 'refreshToken',
    'cpf', 'phone', 'telefone', 'ip_address', 'ip',
  ]);

  /**
   * Inicializa o Sentry. Idempotente.
   * Chamado uma vez no startup do servidor.
   */
  static init() {
    if (SentryClient.#initialized) return;
    SentryClient.#initialized = true;

    if (!process.env.SENTRY_DSN) return;

    try {
      SentryClient.#sentry = require('@sentry/node');
      SentryClient.#sentry.init({
        dsn:              process.env.SENTRY_DSN,
        environment:      process.env.APP_ENV    ?? 'development',
        release:          process.env.APP_VERSION ?? '1.0.0',
        tracesSampleRate: SentryClient.#sampleRate(),
        beforeSend:       SentryClient.#sanitizeEvent.bind(SentryClient),
      });
    } catch {
      SentryClient.#sentry = null;
    }
  }

  /**
   * Captura uma exceção com contexto de domínio (sem PII).
   *
   * @param {Error} err
   * @param {{
   *   userId?:  string,
   *   role?:    string,
   *   command?: string,
   *   domain?:  string,
   *   route?:   string,
   *   traceId?: string,
   *   [key: string]: unknown
   * }} [context={}]
   */
  static captureError(err, context = {}) {
    if (!SentryClient.#sentry) return;

    SentryClient.#sentry.withScope(scope => {
      SentryClient.#applyContext(scope, context);
      SentryClient.#sentry.captureException(err);
    });
  }

  /**
   * Captura uma mensagem de nível de severidade específica.
   * @param {string} message
   * @param {'fatal'|'error'|'warning'|'info'|'debug'} [level='error']
   * @param {object} [context={}]
   */
  static captureMessage(message, level = 'error', context = {}) {
    if (!SentryClient.#sentry) return;

    SentryClient.#sentry.withScope(scope => {
      scope.setLevel(level);
      SentryClient.#applyContext(scope, context);
      SentryClient.#sentry.captureMessage(message);
    });
  }

  /**
   * Define o usuário do escopo global (sem PII).
   * Chame após autenticação bem-sucedida.
   * @param {string} userId — ID opaco/hash, nunca email
   * @param {string} [role]
   */
  static setUser(userId, role) {
    if (!SentryClient.#sentry) return;
    SentryClient.#sentry.setUser({ id: userId, role });
  }

  /** Remove usuário do escopo (após logout). */
  static clearUser() {
    if (!SentryClient.#sentry) return;
    SentryClient.#sentry.setUser(null);
  }

  /** @returns {boolean} */
  static get isEnabled() { return Boolean(SentryClient.#sentry); }

  // ── Privados ────────────────────────────────────────────────

  static #sampleRate() {
    const v = parseFloat(process.env.SENTRY_SAMPLE_RATE ?? '');
    if (!Number.isNaN(v) && v >= 0 && v <= 1) return v;
    return process.env.APP_ENV === 'production' ? 0.1 : 1.0;
  }

  static #applyContext(scope, context) {
    if (context.userId)  scope.setTag('userId',  context.userId);
    if (context.role)    scope.setTag('role',     context.role);
    if (context.command) scope.setTag('command',  context.command);
    if (context.domain)  scope.setTag('domain',   context.domain);
    if (context.route)   scope.setTag('route',    context.route);
    if (context.traceId) scope.setTag('traceId',  context.traceId);

    // Extras: tudo exceto campos PII
    const safeExtras = {};
    for (const [k, v] of Object.entries(context)) {
      if (!SentryClient.#PII_FIELDS.has(k)) safeExtras[k] = v;
    }
    scope.setExtras(safeExtras);
  }

  static #sanitizeEvent(event) {
    // Sanitiza user
    if (event.user) {
      for (const field of SentryClient.#PII_FIELDS) {
        delete event.user[field];
      }
    }

    // Sanitiza request body
    if (event.request?.data && typeof event.request.data === 'object') {
      const safe = { ...event.request.data };
      for (const field of SentryClient.#PII_FIELDS) delete safe[field];
      event.request.data = safe;
    }

    // Remove IP do request
    if (event.request) delete event.request.env?.REMOTE_ADDR;

    return event;
  }
}

module.exports = { SentryClient };
