'use strict';

class RealtimeAnalyticsService {
  #client;
  #channel;

  constructor(client = null) {
    this.#client = client;
    this.#channel = null;
  }

  subscribe(onEvent) {
    if (!this.#client?.channel || typeof onEvent !== 'function') return () => {};

    this.#channel = this.#client
      .channel('analytics:admin:events', { config: { private: true } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'analytics', table: 'analytics_events' },
        ({ new: event }) => onEvent(event),
      )
      .subscribe();

    return () => this.destroy();
  }

  async destroy() {
    if (this.#channel) await this.#client?.removeChannel?.(this.#channel);
    this.#channel = null;
  }
}

globalThis.RealtimeAnalyticsService = RealtimeAnalyticsService;
