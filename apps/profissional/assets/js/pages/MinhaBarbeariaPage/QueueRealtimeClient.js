'use strict';

class QueueRealtimeClient {
  #realtime;
  #timerApi;
  #channel = null;
  #pollingTimer = null;

  constructor({ realtime, timerApi = globalThis } = {}) {
    if (!realtime) throw new Error('QueueRealtimeClient requer realtime injetado.');
    this.#realtime = realtime;
    this.#timerApi = timerApi;
  }

  start({ barbershopId, onChange, poll = null, pollMs = 15000 } = {}) {
    this.stop();
    if (!barbershopId || typeof onChange !== 'function') return;

    try {
      this.#channel = this.#realtime.channel?.(`minha-barbearia-fila-${barbershopId}`)
        ?.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `barbershop_id=eq.${barbershopId}`,
        }, onChange)
        ?.subscribe?.((_status, err) => {
          if (err && typeof poll === 'function') this.#startPolling(poll, pollMs);
        }) ?? null;
    } catch (_) {
      if (typeof poll === 'function') this.#startPolling(poll, pollMs);
    }
  }

  stop() {
    if (this.#channel) this.#realtime.removeChannel?.(this.#channel);
    this.#channel = null;
    if (this.#pollingTimer) this.#timerApi.clearInterval(this.#pollingTimer);
    this.#pollingTimer = null;
  }

  get active() {
    return !!this.#channel || !!this.#pollingTimer;
  }

  #startPolling(poll, pollMs) {
    if (this.#pollingTimer) return;
    this.#pollingTimer = this.#timerApi.setInterval(poll, pollMs);
  }
}
