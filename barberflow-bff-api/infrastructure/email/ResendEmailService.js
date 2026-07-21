'use strict';

const RetryHelper = require('../../utils/RetryHelper');
const { IEmailService } = require('../../domain/notifications/ports/IEmailService');
const { EmailTemplateBuilder } = require('./EmailTemplateBuilder');

class ResendEmailService extends IEmailService {
  #apiKey;
  #from;
  #baseUrl;
  #fetch;
  #logger;

  constructor({
    apiKey = process.env.RESEND_API_KEY ?? '',
    from = process.env.RESEND_FROM_EMAIL ?? 'BarberFlow <noreply@barberflow.live>',
    baseUrl = process.env.RESEND_BASE_URL ?? 'https://api.resend.com',
    fetchImpl = fetch,
    logger = console,
  } = {}) {
    super();
    this.#apiKey = String(apiKey || '').trim();
    this.#from = String(from || '').trim();
    this.#baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.#fetch = fetchImpl;
    this.#logger = logger;
  }

  async sendSignupConfirmation(userEmail, userName, confirmationLink) {
    const appLabel = EmailTemplateBuilder.appLabelFromUrl(confirmationLink);
    return this.#send({
      to: userEmail,
      subject: `Confirme seu cadastro no ${appLabel}`,
      html: EmailTemplateBuilder.signupConfirmation({ userName, confirmationLink }),
      tag: 'signup_confirmation',
    });
  }

  async sendPasswordReset(userEmail, userName, resetLink, expiresInMinutes = 60) {
    const appLabel = EmailTemplateBuilder.appLabelFromUrl(resetLink);
    return this.#send({
      to: userEmail,
      subject: `Recupere sua senha no ${appLabel}`,
      html: EmailTemplateBuilder.passwordReset({ userName, resetLink, expiresInMinutes }),
      tag: 'password_reset',
    });
  }

  async sendPasswordChangedNotification(userEmail, userName) {
    return this.#send({
      to: userEmail,
      subject: 'Sua senha BarberFlow foi alterada',
      html: EmailTemplateBuilder.passwordChanged({ userName }),
      tag: 'password_changed',
    });
  }

  async sendLandingFeedback(destination, feedback) {
    return this.#send({
      to: destination,
      subject: 'Nova mensagem da Landing BarberFlow',
      html: EmailTemplateBuilder.landingFeedback(feedback),
      tag: 'landing_feedback',
    });
  }

  async #send({ to, subject, html, tag }) {
    const email = String(to || '').trim().toLowerCase();
    if (!this.#apiKey) {
      this.#logger.warn?.('[EMAIL] RESEND_API_KEY ausente; envio ignorado', { tag, to: ResendEmailService.#mask(email) });
      return { ok: false, skipped: true, error: 'RESEND_API_KEY ausente.' };
    }

    try {
      const json = await RetryHelper.withRetry(
        async () => {
          const res = await this.#fetch(`${this.#baseUrl}/emails`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.#apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: this.#from,
              to: [email],
              subject,
              html,
              tags: [{ name: 'barberflow_email_type', value: tag }],
            }),
            signal: AbortSignal.timeout(10_000),
          });

          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(body?.message ?? `Resend HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return body;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 300,
          shouldRetry: (err) => !err.status || err.status >= 500 || err.status === 429,
        },
      );

      this.#logger.info?.('[EMAIL] envio ok', { tag, to: ResendEmailService.#mask(email), providerId: json?.id ?? null });
      return { ok: true, providerId: json?.id ?? null };
    } catch (err) {
      this.#logger.error?.('[EMAIL] falha no envio', {
        tag,
        to: ResendEmailService.#mask(email),
        error: err?.message ?? String(err),
      });
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  static #mask(email) {
    const [local, domain] = String(email || '').split('@');
    if (!domain) return '***';
    return `${local.slice(0, 1) || '*'}***@${domain}`;
  }
}

module.exports = { ResendEmailService };
