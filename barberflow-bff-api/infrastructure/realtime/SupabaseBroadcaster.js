'use strict';

/**
 * SupabaseBroadcaster — infraestrutura (BFF).
 *
 * Envia eventos de Supabase Realtime Broadcast via API HTTP, sem manter
 * conexao websocket no servidor. Entrega server->client confiavel para
 * canais privados (`chat.{userId}`): a service_role faz bypass de RLS no
 * envio e o destinatario recebe se autorizado pela policy de realtime.messages.
 *
 * Endpoint: POST {SUPABASE_URL}/realtime/v1/api/broadcast  (sucesso = HTTP 202)
 *
 * SRP: apenas transporte de broadcast. Sem regra de negocio.
 * Testavel: `fetchImpl` injetavel.
 */
class SupabaseBroadcaster {
  #url;
  #serviceKey;
  #fetch;
  #timeoutMs;

  constructor({
    url = process.env.SUPABASE_URL,
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.SUPABASE_BROADCAST_TIMEOUT_MS ?? 750),
  } = {}) {
    this.#url = String(url || '').replace(/\/+$/, '');
    this.#serviceKey = serviceKey || '';
    this.#fetch = typeof fetchImpl === 'function' ? fetchImpl : null;
    this.#timeoutMs = Math.max(1, Number(timeoutMs) || 750);
  }

  /** true quando ha URL, service key e fetch disponiveis. */
  get habilitado() {
    return Boolean(this.#url && this.#serviceKey && this.#fetch);
  }

  /**
   * Publica um broadcast num topico.
   * @param {object} opts
   * @param {string} opts.topic    nome do canal (ex.: `chat.{userId}`)
   * @param {string} opts.event    tipo do evento (ex.: events.v1.chat.message_created)
   * @param {object} opts.payload  corpo do evento
   * @param {boolean} [opts.private=true] canal privado
   * @returns {Promise<{ ok: boolean, status?: number, skipped?: boolean, error?: string }>}
   */
  async broadcast({ topic, event, payload, private: isPrivate = true }) {
    if (!this.habilitado || !topic || !event) return { ok: false, skipped: true };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), this.#timeoutMs)
      : null;
    try {
      const res = await this.#fetch(`${this.#url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.#serviceKey,
          Authorization: `Bearer ${this.#serviceKey}`,
        },
        body: JSON.stringify({
          messages: [{ topic, event, payload, private: isPrivate }],
        }),
        signal: controller?.signal,
      });
      return { ok: res.status === 202 || res.ok === true, status: res.status };
    } catch (err) {
      const timedOut = controller?.signal?.aborted === true;
      return {
        ok: false,
        timedOut,
        error: timedOut ? `broadcast timeout after ${this.#timeoutMs}ms` : (err?.message || String(err)),
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

module.exports = { SupabaseBroadcaster };
