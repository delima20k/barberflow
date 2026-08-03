'use strict';

class LandingPresencePublisher {
  #config;
  #client;
  #channel;

  constructor(config = {}) {
    this.#config = Object.freeze({
      enabled: config.enabled === true,
      supabaseUrl: String(config.supabaseUrl ?? ''),
      supabasePublishableKey: String(config.supabasePublishableKey ?? ''),
      captchaTokenProvider: config.captchaTokenProvider ?? null,
    });
    this.#client = null;
    this.#channel = null;
  }

  async init() {
    if (!this.#isReady()) return this;
    const captchaToken = await this.#config.captchaTokenProvider();
    if (!captchaToken) return this;

    this.#client = globalThis.supabase.createClient(
      this.#config.supabaseUrl,
      this.#config.supabasePublishableKey,
      { auth: { persistSession: false, autoRefreshToken: true } },
    );
    const { data, error } = await this.#client.auth.signInAnonymously({
      options: { captchaToken },
    });
    if (error || !data?.user?.id) return this;

    this.#channel = this.#client.channel('landing-presence', {
      config: { private: true, presence: { key: data.user.id } },
    });
    this.#channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await this.#channel.track({ online: true });
    });
    return this;
  }

  async destroy() {
    await this.#channel?.untrack();
    if (this.#channel && this.#client) await this.#client.removeChannel(this.#channel);
    await this.#client?.auth?.signOut?.();
    this.#channel = null;
    this.#client = null;
  }

  #isReady() {
    return Boolean(
      this.#config.enabled
      && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(this.#config.supabaseUrl)
      && this.#config.supabasePublishableKey.length > 20
      && typeof this.#config.captchaTokenProvider === 'function'
      && globalThis.supabase?.createClient,
    );
  }
}

globalThis.LandingPresencePublisher = LandingPresencePublisher;
