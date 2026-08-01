'use strict';

class SupabaseClientFactory {
  static async create(config = globalThis.AdminConfig, documentRef = document) {
    if (!config?.isSupabaseReady?.()) return null;
    await SupabaseClientFactory.#loadSdk(documentRef);
    const sdk = globalThis.supabase;
    if (!sdk?.createClient) {
      throw new Error('SDK do Supabase Analytics indisponivel.');
    }

    return sdk.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        db: { schema: 'analytics' },
        realtime: {
          params: { eventsPerSecond: 8 },
        },
      },
    );
  }

  static #loadSdk(documentRef) {
    if (globalThis.supabase?.createClient) return Promise.resolve();
    const existing = documentRef.querySelector('[data-supabase-sdk]');
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = documentRef.createElement('script');
      script.src = './assets/vendor/supabase.min.js';
      script.defer = true;
      script.dataset.supabaseSdk = '';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => {
        reject(new Error('Nao foi possivel carregar o SDK do Supabase Analytics.'));
      }, { once: true });
      documentRef.head.append(script);
    });
  }
}

globalThis.SupabaseClientFactory = SupabaseClientFactory;
