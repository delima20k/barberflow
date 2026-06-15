'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

class WriteLoadTestConfig {
  static DEFAULT_BASE_URL = 'https://bff.berberflow.shop';
  static REQUIRED_ENV = Object.freeze([
    'LOADTEST_CLIENT_TOKEN',
    'LOADTEST_PROFESSIONAL_TOKEN',
    'LOADTEST_BARBERSHOP_ID',
    'LOADTEST_PROFESSIONAL_ID',
    'LOADTEST_SERVICE_ID',
  ]);

  #args;
  #env;

  constructor({ args = process.argv.slice(2), env = process.env, now = new Date() } = {}) {
    this.#args = WriteLoadTestConfig.#parseArgs(args);
    this.#env = env;
    this.baseUrl = WriteLoadTestConfig.#normalizeBaseUrl(this.#read('base-url', 'LOADTEST_BASE_URL', WriteLoadTestConfig.DEFAULT_BASE_URL));
    this.enableWrites = WriteLoadTestConfig.#parseBoolean(this.#read('enable-writes', 'LOADTEST_ENABLE_WRITES', 'false'));
    this.enablePush = WriteLoadTestConfig.#parseBoolean(this.#read('enable-push', 'LOADTEST_ENABLE_PUSH', 'false'));
    this.runId = String(this.#read('run-id', 'LOADTEST_RUN_ID', '')).trim();
    this.executionId = WriteLoadTestConfig.#normalizeExecutionId(this.#read(
      'execution-id',
      'LOADTEST_EXECUTION_ID',
      now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
    ));
    this.vus = WriteLoadTestConfig.#parsePositiveInt(this.#read('vus', 'LOADTEST_VUS', '1'), 'vus');
    this.durationSeconds = WriteLoadTestConfig.#parsePositiveInt(this.#read('duration', 'LOADTEST_DURATION_SECONDS', '10'), 'duration');
    this.pacingMs = WriteLoadTestConfig.#parsePositiveInt(this.#read('pacing-ms', 'LOADTEST_PACING_MS', '1500'), 'pacing-ms');
    this.maxWritesPerUser = WriteLoadTestConfig.#parsePositiveInt(
      this.#read('max-writes-per-user', 'LOADTEST_MAX_WRITES_PER_USER', '1'),
      'LOADTEST_MAX_WRITES_PER_USER',
    );
    this.timeoutMs = WriteLoadTestConfig.#parsePositiveInt(this.#read('timeout', 'LOADTEST_TIMEOUT_MS', '8000'), 'timeout');
    this.output = String(this.#read('output', 'LOADTEST_OUTPUT', '')).trim();
    this.cleanupConfirm = String(this.#read('cleanup-confirm', 'LOADTEST_CLEANUP_CONFIRM', '')).trim();
    this.generatedAt = now.toISOString();
    this.fixtures = Object.freeze({
      clientToken: String(this.#env.LOADTEST_CLIENT_TOKEN ?? '').trim(),
      professionalToken: String(this.#env.LOADTEST_PROFESSIONAL_TOKEN ?? '').trim(),
      barbershopId: String(this.#env.LOADTEST_BARBERSHOP_ID ?? '').trim(),
      professionalId: String(this.#env.LOADTEST_PROFESSIONAL_ID ?? '').trim(),
      serviceId: String(this.#env.LOADTEST_SERVICE_ID ?? '').trim(),
      conversationId: String(this.#env.LOADTEST_CONVERSATION_ID ?? '').trim(),
      peerUserId: String(this.#env.LOADTEST_PEER_USER_ID ?? '').trim(),
      queueEntryId: String(this.#env.LOADTEST_QUEUE_ENTRY_ID ?? '').trim(),
      scheduledAt: String(this.#env.LOADTEST_SCHEDULED_AT ?? '').trim(),
      durationMin: WriteLoadTestConfig.#parsePositiveInt(this.#env.LOADTEST_APPOINTMENT_DURATION_MIN ?? '30', 'LOADTEST_APPOINTMENT_DURATION_MIN'),
      priceCharged: WriteLoadTestConfig.#parseOptionalNumber(this.#env.LOADTEST_PRICE_CHARGED),
    });

    this.#validate();
  }

  get cleanupEnabled() {
    return this.cleanupConfirm === 'DELETE_LOADTEST_DATA';
  }

  #read(argName, envName, fallback) {
    return this.#args[argName] ?? this.#env[envName] ?? fallback;
  }

  #validate() {
    if (!this.enableWrites) {
      throw new Error('Harness de escrita exige LOADTEST_ENABLE_WRITES=true.');
    }
    if (this.enablePush) {
      throw new Error('push real deve permanecer desativado: use LOADTEST_ENABLE_PUSH=false.');
    }
    if (!/^loadtest_write_[a-z0-9_-]+$/i.test(this.runId)) {
      throw new Error('LOADTEST_RUN_ID deve usar prefixo isolado loadtest_write_<data>.');
    }
    const missing = WriteLoadTestConfig.REQUIRED_ENV
      .filter(name => !String(this.#env[name] ?? '').trim());
    if (missing.length > 0) {
      throw new Error(`Env obrigatorio ausente: ${missing.join(', ')}.`);
    }
    if (![1, 7, 14, 28, 56].includes(this.vus)) {
      throw new Error(`VUs nao autorizados para harness de escrita: ${this.vus}.`);
    }
  }

  static #parseArgs(args) {
    const parsed = {};
    for (const raw of args) {
      if (!raw.startsWith('--')) continue;
      const [key, ...valueParts] = raw.slice(2).split('=');
      parsed[key] = valueParts.length ? valueParts.join('=') : 'true';
    }
    return parsed;
  }

  static #normalizeBaseUrl(value) {
    const url = String(value).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) throw new Error('LOADTEST_BASE_URL deve iniciar com http:// ou https://.');
    return url;
  }

  static #parseBoolean(value) {
    return ['1', 'true', 'yes', 'sim'].includes(String(value ?? '').trim().toLowerCase());
  }

  static #parsePositiveInt(value, field) {
    const number = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} deve ser inteiro positivo.`);
    return number;
  }

  static #parseOptionalNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error('LOADTEST_PRICE_CHARGED deve ser numero positivo.');
    return number;
  }

  static #normalizeExecutionId(value) {
    const normalized = String(value ?? '').trim().replace(/[^a-z0-9_-]/gi, '').slice(0, 48);
    if (!normalized) throw new Error('LOADTEST_EXECUTION_ID invalido.');
    return normalized;
  }
}

class WriteLoadTestHttpClient {
  #baseUrl;
  #timeoutMs;

  constructor({ baseUrl, timeoutMs = 8000 }) {
    this.#baseUrl = baseUrl;
    this.#timeoutMs = timeoutMs;
  }

  async get(pathname, options = {}) {
    return this.request('GET', pathname, null, options);
  }

  async post(pathname, body = {}, options = {}) {
    return this.request('POST', pathname, body, options);
  }

  async patch(pathname, body = {}, options = {}) {
    return this.request('PATCH', pathname, body, options);
  }

  async delete(pathname, options = {}) {
    return this.request('DELETE', pathname, null, options);
  }

  async request(method, pathname, body = null, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.#timeoutMs);
    const started = performance.now();
    try {
      const response = await fetch(`${this.#baseUrl}${pathname}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Load-Test': 'barberflow-write',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.headers ?? {}),
        },
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      const chatDiagnostics = response.headers.get('x-chat-diagnostics') ?? null;
      return {
        ok: response.ok,
        status: response.status,
        body: WriteLoadTestHttpClient.#parseBody(text),
        durationMs: WriteLoadTestHttpClient.#round(performance.now() - started),
        chatDiagnostics,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: null,
        error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'request failed'),
        durationMs: WriteLoadTestHttpClient.#round(performance.now() - started),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  static #parseBody(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  static #round(value) {
    return Number((Number(value) || 0).toFixed(2));
  }
}

class WriteLoadTestMemoryClient {
  calls = [];
  #queue = [];

  enqueue(response) {
    this.#queue.push(response);
  }

  async get(pathname, options = {}) {
    return this.request('GET', pathname, null, options);
  }

  async post(pathname, body = {}, options = {}) {
    return this.request('POST', pathname, body, options);
  }

  async patch(pathname, body = {}, options = {}) {
    return this.request('PATCH', pathname, body, options);
  }

  async delete(pathname, options = {}) {
    return this.request('DELETE', pathname, null, options);
  }

  async request(method, pathname, body = null, options = {}) {
    this.calls.push({
      method,
      path: pathname,
      body,
      token: options.token ?? null,
      headers: options.headers ?? {},
    });
    return this.#queue.shift() ?? { ok: true, status: 200, body: { ok: true, dados: [] }, durationMs: 1 };
  }
}

class WriteLoadTestHarness {
  static ENDPOINTS = Object.freeze({
    health: '/api/health',
    healthV1: '/api/v1/health',
    featuredBarbershops: '/api/v1/barbearias/destaque?limit=5',
    allBarbershops: '/api/v1/barbearias/todas?limit=10',
    barbershopBarbersStatus: '/api/v1/barbearias/:barbershopId/barbeiros-status',
    appointments: '/api/agendamentos',
    chatConversations: '/api/v1/chat/conversations',
    chatMessages: '/api/v1/chat/conversations/:conversationId/messages',
    queuePlanned: '/api/v1/fila',
    notificationsPushDisabled: '/api/v1/notificacoes/push-barbeiro',
  });

  #config;
  #client;
  #clock;
  #sleeper;

  constructor({ config, client = null, clock = { now: () => new Date() }, sleeper = null }) {
    this.#config = config;
    this.#client = client ?? new WriteLoadTestHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
    this.#clock = clock;
    this.#sleeper = sleeper ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async setup() {
    const checks = [];
    checks.push(await this.#check('health', () => this.#client.get(WriteLoadTestHarness.ENDPOINTS.health)));
    checks.push(await this.#check('health_v1', () => this.#client.get(WriteLoadTestHarness.ENDPOINTS.healthV1)));
    checks.push(await this.#check('barbearias_destaque', () => this.#client.get(WriteLoadTestHarness.ENDPOINTS.featuredBarbershops)));
    checks.push(await this.#check('barbearias_todas', () => this.#client.get(WriteLoadTestHarness.ENDPOINTS.allBarbershops)));
    return this.#report('setup', { checks, writesPerformed: 0 });
  }

  async verifyFixture() {
    const barbershopStatusPath = WriteLoadTestHarness.ENDPOINTS.barbershopBarbersStatus
      .replace(':barbershopId', encodeURIComponent(this.#config.fixtures.barbershopId));
    const checks = [];
    checks.push(await this.#check('barbearia_teste_status_barbeiros', () => this.#client.get(barbershopStatusPath)));
    checks.push(await this.#check('agendamento_listar_cliente_teste', () => this.#client.get('/api/agendamentos?limit=5', {
      token: this.#config.fixtures.clientToken,
    })));
    checks.push(await this.#check('chat_conversas_cliente_teste', () => this.#client.get('/api/v1/chat/conversations?limit=5', {
      token: this.#config.fixtures.clientToken,
    })));
    checks.push(await this.#checkQueueRoute());
    checks.push(this.#notificationCapability());
    return this.#report('verify-fixture', { checks, writesPerformed: 0 });
  }

  async runSmokeOnce({ vu = 1, iteration = 1 } = {}) {
    const created = { appointments: [], messages: [], queueEntries: [], notifications: [] };
    const checks = [];
    const appointment = await this.#createAppointment({ vu, iteration });
    created.appointments.push(appointment.id);
    checks.push({ name: 'agendamento_criar', status: 'ok', resourceId: appointment.id });
    await this.#validateAppointmentLinks(appointment);
    checks.push({ name: 'agendamento_vinculo', status: 'ok' });

    const queueCheck = await this.#checkQueueRoute();
    checks.push(queueCheck);

    const message = await this.#sendChatMessage({ vu, iteration });
    created.messages.push(message.id);
    checks.push({ name: 'chat_enviar_mensagem', status: 'ok', resourceId: message.id });

    checks.push(this.#notificationCapability());
    return this.#report('smoke-write', {
      status: 'ok',
      checks,
      created,
      writesPerformed: 2,
    });
  }

  async runForDuration() {
    const startedAt = this.#clock.now();
    const deadlineMs = startedAt.getTime() + (this.#config.durationSeconds * 1000);
    const vuReports = await Promise.all(
      Array.from({ length: this.#config.vus }, (_, index) => this.#runVu({
        vu: index + 1,
        deadlineMs,
      })),
    );
    const endedAt = this.#clock.now();
    const created = WriteLoadTestHarness.#mergeCreated(vuReports.map(report => report.created));
    const writesPerformed = vuReports.reduce((sum, report) => sum + report.writes, 0);
    const checks = vuReports.flatMap(report => report.checks);
    const summary = WriteLoadTestHarness.#summarizeVuReports(vuReports);
    return this.#report('smoke-write', {
      status: summary.realFailures > 0 || summary.inconsistencies > 0 ? 'error' : 'ok',
      duration: {
        targetSeconds: this.#config.durationSeconds,
        pacingMs: this.#config.pacingMs,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        actualMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      },
      limits: {
        maxWritesPerUser: this.#config.maxWritesPerUser,
      },
      summary,
      vus: vuReports.map(({
        created: _created,
        checks: _checks,
        ...summary
      }) => summary),
      checks,
      created,
      writesPerformed,
    });
  }

  async #runVu({ vu, deadlineMs }) {
    const created = { appointments: [], messages: [], queueEntries: [], notifications: [] };
    const checks = [];
    const startedAt = this.#clock.now();
    let iteration = 0;
    let writeAttempts = 0;
    let writeIterations = 0;
    let writes = 0;
    let skipsByWriteLimit = 0;
    let expectedConflicts = 0;
    let errors = 0;
    let inconsistencies = 0;

    while (this.#clock.now().getTime() < deadlineMs) {
      iteration += 1;
      if (writeAttempts >= this.#config.maxWritesPerUser) {
        skipsByWriteLimit += 1;
        await this.#pace(deadlineMs);
        continue;
      }

      writeAttempts += 1;
      try {
        const report = await this.runSmokeOnce({ vu, iteration });
        writeIterations += 1;
        writes += report.writesPerformed;
        WriteLoadTestHarness.#appendCreated(created, report.created);
        checks.push(...report.checks.map(check => ({ ...check, vu, iteration })));
      } catch (err) {
        if (WriteLoadTestHarness.#isExpectedConflict(err)) {
          expectedConflicts += 1;
          checks.push({
            name: 'write_iteration',
            status: 'expected-conflict',
            vu,
            iteration,
            category: 'expected-concurrency-conflict',
            error: err?.message ?? 'expected conflict',
          });
        } else {
          errors += 1;
          checks.push({
            name: 'write_iteration',
            status: 'error',
            vu,
            iteration,
            category: 'real-failure',
            error: err?.message ?? 'write iteration failed',
          });
        }
      }

      await this.#pace(deadlineMs);
    }

    const endedAt = this.#clock.now();
    return {
      vu,
      iterations: iteration,
      writeAttempts,
      writeIterations,
      writes,
      skipsByWriteLimit,
      expectedConflicts,
      errors,
      inconsistencies,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      actualMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      created,
      checks,
    };
  }

  async cleanup(resources = {}, options = {}) {
    const realCleanup = Boolean(options.realCleanup) && this.#config.cleanupEnabled;
    const targets = {
      appointments: [...(resources.appointments ?? [])],
      messages: [...(resources.messages ?? [])],
      queueEntries: [...(resources.queueEntries ?? [])],
      notifications: [...(resources.notifications ?? [])],
    };
    if (!realCleanup) {
      return this.#report('cleanup', {
        mode: 'dry-run',
        targets,
        writesPerformed: 0,
      });
    }

    const results = [];
    for (const messageId of targets.messages) {
      results.push(await this.#check(`chat_remover_${messageId}`, () => this.#client.delete(
        `/api/v1/chat/messages/${encodeURIComponent(messageId)}`,
        { token: this.#config.fixtures.clientToken },
      )));
    }
    for (const appointmentId of targets.appointments) {
      results.push(await this.#check(`agendamento_cancelar_${appointmentId}`, () => this.#client.delete(
        `/api/agendamentos/${encodeURIComponent(appointmentId)}`,
        { token: this.#config.fixtures.clientToken },
      )));
    }
    return this.#report('cleanup', {
      mode: 'real',
      targets,
      results,
      writesPerformed: results.length,
    });
  }

  async #createAppointment({ vu, iteration }) {
    const idempotencyKey = `${this.#config.runId}:${this.#config.executionId}:appointment:${vu}:${iteration}`;
    const response = await this.#client.post('/api/agendamentos', {
      professional_id: this.#config.fixtures.professionalId,
      barbershop_id: this.#config.fixtures.barbershopId,
      service_id: this.#config.fixtures.serviceId,
      scheduled_at: this.#scheduledAt({ vu, iteration }),
      duration_min: this.#config.fixtures.durationMin,
      notes: `${this.#config.runId} ${this.#config.executionId} smoke appointment vu=${vu} iteration=${iteration}`,
      ...(this.#config.fixtures.priceCharged !== null ? { price_charged: this.#config.fixtures.priceCharged } : {}),
    }, {
      token: this.#config.fixtures.clientToken,
      headers: {
        'Idempotency-Key': idempotencyKey,
        'X-BarberFlow-Diagnostics': 'appointment',
      },
    });
    if (!response.ok) throw new Error(`Falha ao criar agendamento teste: ${WriteLoadTestHarness.#responseError(response)}.`);
    const appointment = WriteLoadTestHarness.#data(response);
    if (!appointment?.id) throw new Error('Resposta de agendamento sem id.');
    return appointment;
  }

  async #sendChatMessage({ vu, iteration }) {
    const conversationId = await this.#resolveConversationId();
    const clientMessageId = `${this.#config.runId}:${this.#config.executionId}:chat:${vu}:${iteration}`;
    const response = await this.#client.post(
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        clientMessageId,
        encrypted_payload: WriteLoadTestHarness.#encryptedPayload(`${this.#config.runId}:${this.#config.executionId}:${vu}:${iteration}`),
        e2e_key_version: 1,
        attachments: [],
      },
      {
        token: this.#config.fixtures.clientToken,
        headers: {
          'Idempotency-Key': clientMessageId,
          'X-BarberFlow-Diagnostics': 'chat',
        },
      },
    );
    if (!response.ok) throw new Error(`Falha ao enviar mensagem teste: ${WriteLoadTestHarness.#responseError(response)}.`);
    const message = WriteLoadTestHarness.#data(response);
    if (!message?.id) throw new Error('Resposta de chat sem id.');
    return message;
  }

  async #resolveConversationId() {
    if (this.#config.fixtures.conversationId) return this.#config.fixtures.conversationId;
    if (!this.#config.fixtures.peerUserId) {
      throw new Error('Chat de escrita exige LOADTEST_CONVERSATION_ID ou LOADTEST_PEER_USER_ID.');
    }
    const response = await this.#client.post('/api/v1/chat/conversations', {
      targetUserId: this.#config.fixtures.peerUserId,
    }, {
      token: this.#config.fixtures.clientToken,
    });
    if (!response.ok) throw new Error(`Falha ao criar conversa teste: ${WriteLoadTestHarness.#responseError(response)}.`);
    const conversation = WriteLoadTestHarness.#data(response);
    if (!conversation?.id) throw new Error('Resposta de conversa sem id.');
    return conversation.id;
  }

  async #validateAppointmentLinks(appointment) {
    const checks = [
      ['barbershop_id', this.#config.fixtures.barbershopId],
      ['professional_id', this.#config.fixtures.professionalId],
      ['service_id', this.#config.fixtures.serviceId],
    ];
    for (const [field, expected] of checks) {
      if (appointment[field] !== expected) {
        throw new Error(`Agendamento teste com vinculo invalido em ${field}.`);
      }
    }
  }

  async #checkQueueRoute() {
    const response = await this.#client.get(
      `/api/v1/fila?barbershop_id=${encodeURIComponent(this.#config.fixtures.barbershopId)}`,
      { token: this.#config.fixtures.professionalToken },
    );
    if (response.status === 404) {
      return {
        name: 'fila_rota_real',
        status: 'unavailable',
        endpoint: WriteLoadTestHarness.ENDPOINTS.queuePlanned,
        note: 'Rota planejada em docs/checklist, mas nao registrada no Express atual.',
      };
    }
    return {
      name: 'fila_rota_real',
      status: response.ok ? 'available' : 'error',
      endpoint: WriteLoadTestHarness.ENDPOINTS.queuePlanned,
      httpStatus: response.status,
    };
  }

  #notificationCapability() {
    return {
      name: 'notificacao_in_app',
      status: 'not-implemented-in-bff',
      note: 'Nao ha endpoint BFF confirmado para criar/listar notificacao in-app; push real permanece desativado.',
      pushRealEnabled: false,
    };
  }

  async #check(name, operation) {
    const response = await operation();
    return {
      name,
      status: response.ok ? 'ok' : 'error',
      httpStatus: response.status,
      durationMs: response.durationMs ?? null,
      error: response.ok ? null : WriteLoadTestHarness.#responseError(response),
    };
  }

  #scheduledAt({ vu, iteration }) {
    const configuredBase = this.#config.fixtures.scheduledAt
      ? new Date(this.#config.fixtures.scheduledAt)
      : null;
    const base = configuredBase && !Number.isNaN(configuredBase.getTime())
      ? configuredBase
      : new Date(this.#clock.now().getTime() + 24 * 60 * 60 * 1000);
    base.setUTCMinutes(
      base.getUTCMinutes()
      + WriteLoadTestHarness.#executionOffsetMinutes(this.#config.executionId)
      + ((vu - 1) * 10)
      + iteration,
    );
    base.setUTCSeconds(0, 0);
    return base.toISOString();
  }

  async #pace(deadlineMs) {
    const remainingMs = deadlineMs - this.#clock.now().getTime();
    if (remainingMs <= 0) return;
    await this.#sleeper(Math.min(this.#config.pacingMs, remainingMs));
  }

  #report(action, payload) {
    return {
      action,
      status: payload.status ?? 'ok',
      baseUrl: this.#config.baseUrl,
      runId: this.#config.runId,
      executionId: this.#config.executionId,
      generatedAt: new Date().toISOString(),
      endpoints: WriteLoadTestHarness.ENDPOINTS,
      ...payload,
    };
  }

  static #data(response) {
    return response?.body?.dados ?? response?.body?.data ?? response?.body;
  }

  static #responseError(response) {
    return response?.error
      ?? response?.body?.erro
      ?? response?.body?.error
      ?? response?.body?.message
      ?? `HTTP ${response?.status ?? 0}`;
  }

  static #isExpectedConflict(err) {
    const message = String(err?.message ?? err ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [
      'horario nao disponivel',
      'horario ocupado',
      'cadeira ocupada',
      'posicao indisponivel',
      'conflito com agendamento',
      'conflito de agenda',
      'agenda conflict',
      'schedule conflict',
      'slot unavailable',
      'position unavailable',
      'chair unavailable',
      'chair occupied',
      'http 409',
    ].some(pattern => message.includes(pattern));
  }

  static #encryptedPayload(seed) {
    return {
      v: 1,
      alg: 'AES-GCM-256',
      iv: Buffer.from(`iv:${seed}`).toString('base64').slice(0, 24),
      ct: Buffer.from(`loadtest:${seed}`).toString('base64'),
      kid: 'loadtest',
    };
  }

  static #mergeCreated(collections) {
    const merged = { appointments: [], messages: [], queueEntries: [], notifications: [] };
    for (const created of collections) {
      WriteLoadTestHarness.#appendCreated(merged, created);
    }
    return merged;
  }

  static #appendCreated(target, created = {}) {
    for (const key of ['appointments', 'messages', 'queueEntries', 'notifications']) {
      target[key].push(...(created[key] ?? []));
    }
  }

  static #summarizeVuReports(vuReports) {
    return {
      vus: vuReports.length,
      iterations: vuReports.reduce((sum, report) => sum + report.iterations, 0),
      writeAttempts: vuReports.reduce((sum, report) => sum + report.writeAttempts, 0),
      successfulWriteIterations: vuReports.reduce((sum, report) => sum + report.writeIterations, 0),
      writesSucceeded: vuReports.reduce((sum, report) => sum + report.writes, 0),
      expectedConflicts: vuReports.reduce((sum, report) => sum + report.expectedConflicts, 0),
      realFailures: vuReports.reduce((sum, report) => sum + report.errors, 0),
      skipsByWriteLimit: vuReports.reduce((sum, report) => sum + report.skipsByWriteLimit, 0),
      inconsistencies: vuReports.reduce((sum, report) => sum + report.inconsistencies, 0),
    };
  }

  static #executionOffsetMinutes(executionId) {
    let hash = 0;
    for (const char of String(executionId)) {
      hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
    }
    return 60 + (hash % (14 * 24 * 60));
  }
}

class WriteLoadTestReportWriter {
  static write({ config, report, suffix }) {
    const output = config.output || path.join(
      'docs',
      'perf',
      'load-results',
      `${new Date().toISOString().replace(/[:.]/g, '-')}_${config.runId}_${suffix}.json`,
    );
    const absolute = path.resolve(process.cwd(), output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
    return absolute;
  }
}

module.exports = {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestHttpClient,
  WriteLoadTestMemoryClient,
  WriteLoadTestReportWriter,
};
