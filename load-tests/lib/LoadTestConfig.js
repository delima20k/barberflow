'use strict';

class LoadTestConfig {
  static #ALLOWED_VUS = new Set([1, 7, 14, 28, 56]);
  static #MAX_VUS = 56;

  constructor({ args = process.argv.slice(2), env = process.env, now = new Date() } = {}) {
    const parsed = LoadTestConfig.#parseArgs(args);
    this.baseUrl = LoadTestConfig.#normalizeBaseUrl(parsed['base-url'] ?? env.LOADTEST_BASE_URL ?? 'http://127.0.0.1:3002');
    this.vus = LoadTestConfig.#parsePositiveInt(parsed.vus ?? env.LOADTEST_VUS, 'vus');
    this.durationSeconds = LoadTestConfig.#parsePositiveInt(parsed.duration ?? env.LOADTEST_DURATION_SECONDS ?? '30', 'duration');
    this.scenario = String(parsed.scenario ?? env.LOADTEST_SCENARIO ?? 'all').trim();
    this.stage = String(parsed.stage ?? env.LOADTEST_STAGE ?? `manual-${this.vus}vu`).trim();
    this.group = LoadTestConfig.#sanitizeGroup(parsed.group ?? env.LOADTEST_GROUP ?? this.stage);
    this.prefix = `loadtest_${LoadTestConfig.#dateStamp(now)}_${this.group}`;
    this.authToken = String(parsed.token ?? env.LOADTEST_ACCESS_TOKEN ?? '').trim();
    this.professionalToken = String(env.LOADTEST_PROFESSIONAL_TOKEN ?? this.authToken).trim();
    this.clientToken = String(env.LOADTEST_CLIENT_TOKEN ?? this.authToken).trim();
    this.enableWrites = LoadTestConfig.#parseBoolean(parsed['enable-writes'] ?? env.LOADTEST_ENABLE_WRITES);
    this.enablePush = LoadTestConfig.#parseBoolean(parsed['enable-push'] ?? env.LOADTEST_ENABLE_PUSH);
    this.output = String(parsed.output ?? env.LOADTEST_OUTPUT ?? '').trim();
    this.timeoutMs = LoadTestConfig.#parsePositiveInt(parsed.timeout ?? env.LOADTEST_TIMEOUT_MS ?? '8000', 'timeout');
    this.thinkTimeMs = LoadTestConfig.#parsePositiveInt(parsed['think-time'] ?? env.LOADTEST_THINK_TIME_MS ?? '250', 'think-time');
    this.fixtures = Object.freeze({
      email: String(env.LOADTEST_EMAIL ?? '').trim(),
      password: String(env.LOADTEST_PASSWORD ?? '').trim(),
      peerUserId: String(env.LOADTEST_PEER_USER_ID ?? '').trim(),
      conversationId: String(env.LOADTEST_CONVERSATION_ID ?? '').trim(),
      barbershopId: String(env.LOADTEST_BARBERSHOP_ID ?? '').trim(),
      professionalId: String(env.LOADTEST_PROFESSIONAL_ID ?? '').trim(),
      serviceId: String(env.LOADTEST_SERVICE_ID ?? '').trim(),
      appointmentId: String(env.LOADTEST_APPOINTMENT_ID ?? '').trim(),
      queueEntryId: String(env.LOADTEST_QUEUE_ENTRY_ID ?? '').trim(),
    });

    this.#validate();
  }

  #validate() {
    if (!LoadTestConfig.#ALLOWED_VUS.has(this.vus)) {
      throw new Error(`VUs nao autorizados: ${this.vus}. Use somente 1, 7, 14, 28 ou 56 com autorizacao manual.`);
    }
    if (this.vus > LoadTestConfig.#MAX_VUS) {
      throw new Error(`VUs acima do maximo autorizado (${LoadTestConfig.#MAX_VUS}).`);
    }
    if (!this.scenario) throw new Error('Scenario obrigatorio.');
    if (this.enablePush && !this.enableWrites) {
      throw new Error('LOADTEST_ENABLE_PUSH exige LOADTEST_ENABLE_WRITES=true para evitar disparo acidental.');
    }
  }

  static #parseArgs(args) {
    const parsed = {};
    for (const raw of args) {
      if (!raw.startsWith('--')) continue;
      const [key, ...valueParts] = raw.slice(2).split('=');
      parsed[key] = valueParts.length > 0 ? valueParts.join('=') : 'true';
    }
    return parsed;
  }

  static #parsePositiveInt(value, field) {
    const number = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(`${field} deve ser inteiro positivo.`);
    }
    return number;
  }

  static #parseBoolean(value) {
    return ['1', 'true', 'yes', 'sim'].includes(String(value ?? '').trim().toLowerCase());
  }

  static #normalizeBaseUrl(value) {
    const url = String(value).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) throw new Error('base-url deve iniciar com http:// ou https://');
    return url;
  }

  static #sanitizeGroup(value) {
    const clean = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return clean || 'grupo';
  }

  static #dateStamp(now) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
}

module.exports = LoadTestConfig;
