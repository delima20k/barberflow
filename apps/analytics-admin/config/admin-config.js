'use strict';

class AdminConfig {
  static #runtime = Object.freeze({
    mode: globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.mode ?? 'demo',
    productionUrl:
      globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.productionUrl
      ?? 'https://superadmin.barberflow.live',
    supabaseUrl: globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.supabaseUrl ?? '',
    supabasePublishableKey:
      globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.supabasePublishableKey ?? '',
    collectorUrl: globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.collectorUrl ?? '',
    buildVersion: globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG?.buildVersion ?? 'demo-local',
    sessionTimeoutMinutes: 30,
    pageSize: 12,
  });

  static get mode() {
    return AdminConfig.#runtime.mode;
  }

  static get productionUrl() {
    return AdminConfig.#runtime.productionUrl;
  }

  static get supabaseUrl() {
    return AdminConfig.#runtime.supabaseUrl;
  }

  static get supabasePublishableKey() {
    return AdminConfig.#runtime.supabasePublishableKey;
  }

  static get collectorUrl() {
    return AdminConfig.#runtime.collectorUrl;
  }

  static get buildVersion() {
    return AdminConfig.#runtime.buildVersion;
  }

  static get sessionTimeoutMinutes() {
    return AdminConfig.#runtime.sessionTimeoutMinutes;
  }

  static get pageSize() {
    return AdminConfig.#runtime.pageSize;
  }

  static isDemo() {
    return AdminConfig.mode === 'demo';
  }

  static isSupabaseReady() {
    return (
      AdminConfig.mode === 'supabase'
      && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(AdminConfig.supabaseUrl)
      && AdminConfig.supabasePublishableKey.length > 20
    );
  }
}

globalThis.AdminConfig = AdminConfig;
