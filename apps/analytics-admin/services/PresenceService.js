'use strict';

class PresenceService {
  #client;
  #channel;

  constructor(client = null) {
    this.#client = client;
    this.#channel = null;
  }

  subscribeAdmin(onSync) {
    if (!this.#client?.channel || typeof onSync !== 'function') return () => {};

    this.#channel = this.#client.channel('analytics:landing:presence', {
      config: {
        private: true,
        presence: { key: 'analytics-admin' },
      },
    });
    this.#channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.#channel.presenceState();
        onSync(Object.values(state).flat().length);
      })
      .subscribe();

    return () => this.destroy();
  }

  async destroy() {
    if (this.#channel) await this.#client?.removeChannel?.(this.#channel);
    this.#channel = null;
  }
}

globalThis.PresenceService = PresenceService;
