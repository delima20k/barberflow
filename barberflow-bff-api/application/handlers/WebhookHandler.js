'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * WebhookHandler — Entrega de webhooks externos com retry exponencial.
 *
 * Envia um POST HTTP para a URL registrada pelo parceiro/integração.
 * Timeout de 10s por tentativa. Considera 2xx como sucesso.
 * Erros de rede e 5xx disparam retry automático (via RetryPolicy.webhookPolicy()).
 * 4xx são falhas definitivas (não retentam — erro do receptor).
 *
 * Payload esperado:
 *   url          — endpoint do receptor
 *   event        — nome do evento ('appointment.created', 'queue.updated', etc.)
 *   data         — objeto com os dados do evento
 *   secret       — HMAC-SHA256 secret para assinatura (opcional)
 *   webhookId    — ID do webhook configurado
 */
class WebhookHandler extends JobHandler {
  #httpClient;

  /**
   * @param {{
   *   httpClient: {
   *     post(url: string, body: object, headers: object, timeoutMs: number): Promise<{ status: number }>
   *   }
   * }} deps
   */
  constructor({ httpClient }) {
    super();
    if (!httpClient) throw new TypeError('WebhookHandler: httpClient é obrigatório');
    this.#httpClient = httpClient;
  }

  get jobType() { return JOB_TYPES.DELIVER_WEBHOOK; }

  async handle(job) {
    const { url, event, data, secret, webhookId } = job.payload;

    if (!url)   throw new Error('WebhookHandler: url ausente');
    if (!event) throw new Error('WebhookHandler: event ausente');

    const body = { event, data: data ?? {}, webhookId, deliveredAt: new Date().toISOString() };
    const headers = {
      'Content-Type':   'application/json',
      'X-BarberFlow-Event': event,
      ...(secret ? { 'X-BarberFlow-Signature': this.#sign(secret, body) } : {}),
    };

    const response = await this.#httpClient.post(url, body, headers, 10_000);

    if (response.status >= 400 && response.status < 500) {
      // 4xx: erro do receptor — não retenta, lança como definitivo
      const err = new Error(`WebhookHandler: receptor retornou ${response.status} (não retentável)`);
      err.noRetry = true;
      throw err;
    }
    if (response.status >= 500) {
      throw new Error(`WebhookHandler: receptor retornou ${response.status} — retry`);
    }
  }

  #sign(secret, body) {
    const { createHmac } = require('node:crypto');
    return 'sha256=' + createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  }
}

module.exports = { WebhookHandler };
