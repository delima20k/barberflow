import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

class RuntimeConfigBuilder {
  #root;
  #environment;

  constructor(root, environment = process.env) {
    this.#root = root;
    this.#environment = environment;
  }

  async build() {
    const values = this.#values();
    this.#assertPublicConfiguration(values);
    const source = `'use strict';\n\n`
      + `globalThis.ANALYTICS_ADMIN_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(values, null, 2)});\n`;
    await writeFile(path.join(this.#root, 'config', 'runtime-config.js'), source, 'utf8');
  }

  #values() {
    return {
      mode: this.#environment.ANALYTICS_ADMIN_MODE || 'demo',
      productionUrl: this.#environment.ANALYTICS_ADMIN_PRODUCTION_URL
        || 'https://superadmin.barberflow.live',
      supabaseUrl: this.#environment.ANALYTICS_SUPABASE_URL || '',
      supabasePublishableKey:
        this.#environment.ANALYTICS_SUPABASE_PUBLISHABLE_KEY || '',
      collectorUrl: this.#environment.ANALYTICS_COLLECTOR_URL || '',
      buildVersion: this.#environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
        || this.#environment.ANALYTICS_BUILD_VERSION
        || 'demo-local',
    };
  }

  #assertPublicConfiguration(values) {
    const forbidden = [
      this.#environment.SUPABASE_SERVICE_ROLE_KEY,
      this.#environment.ANALYTICS_HMAC_SECRET,
    ].filter(Boolean);
    if (forbidden.some((secret) => Object.values(values).includes(secret))) {
      throw new Error('Credencial privada nao pode ser incluida no runtime do navegador.');
    }

    if (values.mode !== 'supabase') return;
    const ready = (
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(values.supabaseUrl)
      && values.supabasePublishableKey.length > 20
      && /^https:\/\//.test(values.collectorUrl)
    );
    if (!ready) throw new Error('Configuracao publica do Supabase Analytics incompleta.');
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await new RuntimeConfigBuilder(root).build();
