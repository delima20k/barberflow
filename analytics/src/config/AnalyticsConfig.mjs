export class AnalyticsConfig {
  static #REQUIRED = Object.freeze([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANALYTICS_HMAC_SECRET',
  ]);

  constructor(values = {}) {
    this.enabled = values.ANALYTICS_ENABLED === 'true';
    this.supabaseUrl = values.SUPABASE_URL || '';
    this.publishableKey = values.SUPABASE_PUBLISHABLE_KEY || '';
    this.serviceRoleKey = values.SUPABASE_SERVICE_ROLE_KEY || '';
    this.allowedOrigin = values.ANALYTICS_ALLOWED_ORIGIN || 'https://barberflow.live';
    this.hmacSecret = values.ANALYTICS_HMAC_SECRET || '';
    this.ipLimit = Number(values.ANALYTICS_RATE_LIMIT_IP || 120);
    this.sessionLimit = Number(values.ANALYTICS_RATE_LIMIT_SESSION || 60);
  }

  assertReady() {
    const missing = AnalyticsConfig.#REQUIRED.filter((key) => !this.#valueFor(key));
    if (missing.length) throw new Error(`Analytics configuration is incomplete: ${missing.join(', ')}`);
  }

  #valueFor(key) {
    return ({
      SUPABASE_URL: this.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: this.serviceRoleKey,
      ANALYTICS_HMAC_SECRET: this.hmacSecret,
    })[key];
  }
}
