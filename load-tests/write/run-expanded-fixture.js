'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

class ExpandedFixtureSupabaseAdmin {
  constructor({ url, anonKey, serviceRoleKey }) {
    this.url = String(url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/auth\/v1$/i, '');
    this.anonKey = anonKey;
    this.serviceRoleKey = serviceRoleKey;
  }

  async request(endpoint, { method = 'GET', role = 'service', body = null, headers = {} } = {}) {
    const key = role === 'anon' ? this.anonKey : this.serviceRoleKey;
    const response = await fetch(`${this.url}${endpoint}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
      body: body === null ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = ExpandedFixtureSupabaseAdmin.parse(text);
    if (!response.ok) {
      const message = parsed?.message || parsed?.error_description || parsed?.error || text || `HTTP ${response.status}`;
      throw new Error(`${method} ${endpoint} failed: ${message}`);
    }
    return parsed;
  }

  async updatePassword(userId, password) {
    return this.request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: { password } });
  }

  async token(email, password) {
    const session = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      role: 'anon',
      body: { email, password },
    });
    if (!session?.access_token) throw new Error('token response without access_token');
    return session.access_token;
  }

  async select(table, ids) {
    if (!ids.length) return [];
    return this.request(`/rest/v1/${table}?id=in.(${ids.join(',')})`);
  }

  async selectMessagesByClientIds(clientMessageIds) {
    if (!clientMessageIds.length) return [];
    const encoded = clientMessageIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
    return this.request(`/rest/v1/chat_messages?client_message_id=in.(${encodeURIComponent(encoded)})`);
  }

  static parse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }
}

class ExpandedFixtureHttpClient {
  constructor({ baseUrl, metrics, timeoutMs = 8000 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.metrics = metrics;
    this.timeoutMs = timeoutMs;
  }

  async get(pathname, options = {}) {
    return this.request('GET', pathname, null, options);
  }

  async post(pathname, body = {}, options = {}) {
    return this.request('POST', pathname, body, options);
  }

  async request(method, pathname, body = null, options = {}) {
    const controller = new AbortController();
    const started = performance.now();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Load-Test': 'barberflow-write-expanded',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.headers ?? {}),
        },
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      const durationMs = ExpandedFixtureHttpClient.round(performance.now() - started);
      const requestId = response.headers.get('x-request-id')
        || response.headers.get('x-vercel-id')
        || response.headers.get('cf-ray')
        || null;
      const appointmentDiagnostics = response.headers.get('x-appointment-diagnostics') ?? null;
      const chatDiagnostics = response.headers.get('x-chat-diagnostics') ?? null;
      const serverTiming = response.headers.get('server-timing') ?? null;
      const result = {
        ok: response.ok,
        status: response.status,
        body: ExpandedFixtureSupabaseAdmin.parse(text),
        durationMs,
        requestId,
        appointmentDiagnostics,
        appointmentTimings: ExpandedFixtureHttpClient.parseDiagnostics(appointmentDiagnostics),
        chatDiagnostics,
        chatTimings: ExpandedFixtureHttpClient.parseDiagnostics(chatDiagnostics),
        serverTiming,
      };
      this.metrics.push({
        method,
        pathname,
        status: response.status,
        ok: response.ok,
        durationMs,
        timeout: false,
        requestId,
        appointmentDiagnostics,
        chatDiagnostics,
        chatTimings: result.chatTimings,
        serverTiming,
        domain: options.domain ?? 'unknown',
        phase: options.phase ?? pathname,
        vu: options.vu ?? null,
      });
      return result;
    } catch (err) {
      const durationMs = ExpandedFixtureHttpClient.round(performance.now() - started);
      const isTimeout = err?.name === 'AbortError';
      this.metrics.push({
        method,
        pathname,
        status: 0,
        ok: false,
        durationMs,
        timeout: isTimeout,
        requestId: null,
        appointmentDiagnostics: null,
        chatDiagnostics: null,
        chatTimings: {},
        serverTiming: null,
        domain: options.domain ?? 'unknown',
        phase: options.phase ?? pathname,
        vu: options.vu ?? null,
      });
      return {
        ok: false,
        status: 0,
        body: null,
        error: isTimeout ? 'timeout' : err?.message,
        durationMs,
        timeout: isTimeout,
        requestId: null,
        appointmentDiagnostics: null,
        appointmentTimings: {},
        chatDiagnostics: null,
        chatTimings: {},
        serverTiming: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  static round(value) {
    return Number((Number(value) || 0).toFixed(2));
  }

  static parseDiagnostics(header) {
    if (!header) return {};
    return Object.fromEntries(String(header)
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value !== undefined)
      .map(([key, value]) => {
        const parsed = Number.parseFloat(value);
        return [key, Number.isFinite(parsed) ? parsed : String(value)];
      }));
  }
}

class ExpandedFixtureWriteRunner {
  constructor({ admin, fixture, baseUrl }) {
    this.admin = admin;
    this.fixture = fixture;
    this.baseUrl = baseUrl;
    this.executionId = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    this.metrics = [];
    this.http = new ExpandedFixtureHttpClient({ baseUrl, metrics: this.metrics });
    this.password = `L0adtest!${crypto.randomUUID()}`;
    this.tokens = new Map();
  }

  async prepareTokens(assignments) {
    const neededClientIds = new Set(assignments.map(item => item.client.id));
    const neededProfessionalIds = new Set(assignments.map(item => item.professional.id));
    const users = [
      ...this.fixture.clients.filter(c => neededClientIds.has(c.id)).map(c => ({
        id: c.id,
        email: `${this.fixture.runId}_client_${c.clientIndex}@example.invalid`,
      })),
      ...this.fixture.professionals.filter(p => neededProfessionalIds.has(p.id)).map(p => ({
        id: p.id,
        email: `${this.fixture.runId}_pro_${p.shopIndex}_${p.proIndex}@example.invalid`,
      })),
    ];
    for (const user of users) await this.admin.updatePassword(user.id, this.password);
    for (const user of users) {
      this.tokens.set(user.id, await this.tokenWithBackoff(user.email));
      await ExpandedFixtureWriteRunner.sleep(250);
    }
    return { users: users.length };
  }

  async tokenWithBackoff(email) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await this.admin.token(email, this.password);
      } catch (err) {
        lastError = err;
        if (!String(err?.message ?? '').includes('429')) throw err;
        await ExpandedFixtureWriteRunner.sleep(1000 * attempt);
      }
    }
    throw lastError;
  }

  assignments() {
    const clients = [...this.fixture.clients].sort((a, b) => a.clientIndex - b.clientIndex);
    const slotsByShop = new Map(this.fixture.barbershops.map(shop => [shop.id, []]));
    for (const slot of this.fixture.slotPlans) {
      if (!slotsByShop.has(slot.barbershopId)) slotsByShop.set(slot.barbershopId, []);
      slotsByShop.get(slot.barbershopId).push(slot);
    }
    for (const slots of slotsByShop.values()) {
      slots.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt))
        || String(a.professionalId).localeCompare(String(b.professionalId)));
    }

    const assignments = [];
    let clientIndex = 0;
    while (clientIndex < clients.length) {
      let assignedInRound = 0;
      for (const shop of this.fixture.barbershops) {
        if (clientIndex >= clients.length) break;
        const slot = slotsByShop.get(shop.id)?.shift();
        if (!slot) continue;
        assignments.push({
          vu: assignments.length + 1,
          client: clients[clientIndex],
          slot,
          professional: this.fixture.professionals.find(item => item.id === slot.professionalId),
        });
        clientIndex += 1;
        assignedInRound += 1;
      }
      if (assignedInRound === 0) break;
    }
    return assignments;
  }

  async run({ vus = 28, durationSeconds = 30, pacingMs = 1500, maxWritesPerUser = 1 } = {}) {
    ExpandedFixtureWriteRunner.assertAllowedVus(vus);
    const assignments = this.assignments().slice(0, vus);
    const startedAt = new Date();
    const deadlineMs = startedAt.getTime() + durationSeconds * 1000;
    const vuReports = await Promise.all(assignments.map(item => this.runVu({ assignment: item, deadlineMs, pacingMs, maxWritesPerUser })));
    const endedAt = new Date();
    const report = this.report({ vuReports, startedAt, endedAt, durationSeconds, pacingMs, maxWritesPerUser });
    report.validation = await this.validate(report);
    report.cleanupDryRun = {
      mode: 'dry-run',
      wouldRemove: {
        appointments: report.created.appointments,
        messages: report.created.messages,
        chatConversations: [...new Set(report.created.conversations)],
        queueEntries: [],
        notifications: [],
      },
    };
    return report;
  }

  async runVu({ assignment, deadlineMs, pacingMs, maxWritesPerUser }) {
    const state = {
      vu: assignment.vu,
      barbershopId: assignment.slot.barbershopId,
      professionalId: assignment.slot.professionalId,
      clientId: assignment.client.id,
      assignment: {
        vu: assignment.vu,
        barbershopId: assignment.slot.barbershopId,
        professionalId: assignment.slot.professionalId,
        clientId: assignment.client.id,
        serviceId: assignment.slot.serviceId,
        slotUsed: {
          scheduledAt: assignment.slot.scheduledAt,
          durationMin: assignment.slot.durationMin,
        },
      },
      iterations: 0,
      writeAttempts: 0,
      writeIterations: 0,
      writes: 0,
      skipsByWriteLimit: 0,
      expectedConflicts: 0,
      errors: 0,
      inconsistencies: 0,
      checks: [],
      created: { appointments: [], messages: [], conversations: [] },
    };
    while (Date.now() < deadlineMs) {
      state.iterations += 1;
      if (state.writeAttempts >= maxWritesPerUser) {
        state.skipsByWriteLimit += 1;
        await ExpandedFixtureWriteRunner.sleep(Math.min(pacingMs, Math.max(0, deadlineMs - Date.now())));
        continue;
      }
      state.writeAttempts += 1;
      await this.executeWriteAttempt({ state, assignment });
      await ExpandedFixtureWriteRunner.sleep(Math.min(pacingMs, Math.max(0, deadlineMs - Date.now())));
    }
    return state;
  }

  async executeWriteAttempt({ state, assignment }) {
    const clientToken = this.tokens.get(assignment.client.id);
    const professionalToken = this.tokens.get(assignment.professional.id);
    const appointment = await this.createAppointment({ assignment, clientToken });
    let countedWriteIteration = false;
    if (appointment.kind === 'expected-conflict') {
      state.expectedConflicts += 1;
      state.checks.push({
        name: 'agendamento_criar',
        status: 'expected-conflict',
        category: 'expected-concurrency-conflict',
        message: appointment.message,
        endpoint: '/api/agendamentos',
        durationMs: appointment.durationMs,
        httpStatus: appointment.httpStatus,
        requestId: appointment.requestId,
        timings: appointment.timings,
        diagnosticsHeader: appointment.diagnosticsHeader,
      });
    } else if (appointment.kind === 'error') {
      state.errors += 1;
      state.checks.push({
        name: 'agendamento_criar',
        status: 'error',
        message: appointment.message,
        endpoint: '/api/agendamentos',
        durationMs: appointment.durationMs,
        httpStatus: appointment.httpStatus,
        requestId: appointment.requestId,
        timings: appointment.timings,
        diagnosticsHeader: appointment.diagnosticsHeader,
      });
      return;
    } else {
      state.writeIterations += 1;
      countedWriteIteration = true;
      state.writes += 1;
      state.created.appointments.push(appointment.data.id);
      const linksOk = appointment.data.barbershop_id === assignment.slot.barbershopId
        && appointment.data.professional_id === assignment.slot.professionalId
        && appointment.data.service_id === assignment.slot.serviceId;
      if (!linksOk) state.inconsistencies += 1;
      state.checks.push({
        name: 'agendamento_criar',
        status: 'ok',
        resourceId: appointment.data.id,
        endpoint: '/api/agendamentos',
        durationMs: appointment.durationMs,
        httpStatus: appointment.httpStatus,
        requestId: appointment.requestId,
        timings: appointment.timings,
        diagnosticsHeader: appointment.diagnosticsHeader,
      });
      state.checks.push({ name: 'agendamento_vinculo', status: linksOk ? 'ok' : 'error' });
    }

    const queueEndpoint = `/api/v1/fila?barbershop_id=${encodeURIComponent(assignment.slot.barbershopId)}`;
    const queue = await this.http.get(queueEndpoint, {
      token: professionalToken,
      domain: 'leitura',
      phase: 'fila_rota_real',
      vu: assignment.vu,
    });
    state.checks.push({
      name: 'fila_rota_real',
      status: queue.status === 404 ? 'unavailable' : (queue.ok ? 'available' : 'error'),
      httpStatus: queue.status,
      endpoint: queueEndpoint,
      durationMs: queue.durationMs,
      requestId: queue.requestId,
    });

    const conversationEndpoint = '/api/v1/chat/conversations';
    const conversation = await this.http.post(conversationEndpoint, { targetUserId: assignment.slot.professionalId }, {
      token: clientToken,
      domain: 'chat',
      phase: 'chat_criar_conversa',
      vu: assignment.vu,
    });
    if (!conversation.ok) {
      state.errors += 1;
      state.checks.push({
        name: 'chat_criar_conversa',
        status: 'error',
        httpStatus: conversation.status,
        message: this.errorMessage(conversation),
        endpoint: conversationEndpoint,
        durationMs: conversation.durationMs,
        timeout: Boolean(conversation.timeout),
        requestId: conversation.requestId,
      });
      return;
    }
    const conversationData = this.data(conversation);
    if (conversationData?.id) state.created.conversations.push(conversationData.id);
    state.checks.push({
      name: 'chat_criar_conversa',
      status: 'ok',
      resourceId: conversationData?.id ?? null,
      endpoint: conversationEndpoint,
      durationMs: conversation.durationMs,
      httpStatus: conversation.status,
      requestId: conversation.requestId,
    });

    const clientMessageId = `${this.fixture.runId}:${this.executionId}:chat:${assignment.vu}:1`;
    const messageEndpoint = `/api/v1/chat/conversations/${encodeURIComponent(conversationData.id)}/messages`;
    const message = await this.http.post(
      messageEndpoint,
      { clientMessageId, encrypted_payload: this.payload(clientMessageId), e2e_key_version: 1, attachments: [] },
      {
        token: clientToken,
        headers: {
          'Idempotency-Key': clientMessageId,
          'X-BarberFlow-Diagnostics': 'chat',
        },
        domain: 'chat',
        phase: 'chat_enviar_mensagem',
        vu: assignment.vu,
      },
    );
    if (!message.ok) {
      state.errors += 1;
      state.checks.push({
        name: 'chat_enviar_mensagem',
        status: 'error',
        httpStatus: message.status,
        message: this.errorMessage(message),
        clientMessageId,
        endpoint: messageEndpoint,
        durationMs: message.durationMs,
        timeout: Boolean(message.timeout),
        requestId: message.requestId,
      });
      return;
    }
    const messageData = this.data(message);
    if (!countedWriteIteration) state.writeIterations += 1;
    state.writes += 1;
    if (messageData?.id) state.created.messages.push(messageData.id);
    state.checks.push({
      name: 'chat_enviar_mensagem',
      status: 'ok',
      resourceId: messageData?.id ?? null,
      clientMessageId,
      endpoint: messageEndpoint,
      durationMs: message.durationMs,
      httpStatus: message.status,
      requestId: message.requestId,
      diagnosticsHeader: message.chatDiagnostics,
      timings: message.chatTimings,
    });
    state.checks.push({ name: 'notificacao_in_app', status: 'not-implemented-in-bff', pushRealEnabled: false });
  }

  async createAppointment({ assignment, clientToken }) {
    const idempotencyKey = `${this.fixture.runId}:${this.executionId}:appointment:${assignment.vu}:1`;
    const response = await this.http.post('/api/agendamentos', {
      professional_id: assignment.slot.professionalId,
      barbershop_id: assignment.slot.barbershopId,
      service_id: assignment.slot.serviceId,
      scheduled_at: this.scheduledAtForLoad(assignment.slot.scheduledAt),
      duration_min: assignment.slot.durationMin,
      notes: `${this.fixture.runId} expanded vu=${assignment.vu}`,
    }, {
      token: clientToken,
      headers: {
        'Idempotency-Key': idempotencyKey,
        'X-BarberFlow-Diagnostics': 'appointment',
      },
      domain: 'agendamento',
      phase: 'agendamento_criar',
      vu: assignment.vu,
    });
    if (response.ok) {
      return {
        kind: 'ok',
        data: this.data(response),
        durationMs: response.durationMs,
        httpStatus: response.status,
        requestId: response.requestId,
        timings: response.appointmentTimings,
        diagnosticsHeader: response.appointmentDiagnostics,
      };
    }
    const message = this.errorMessage(response);
    return this.isExpectedConflict(response, message)
      ? { kind: 'expected-conflict', message, durationMs: response.durationMs, httpStatus: response.status, requestId: response.requestId, timings: response.appointmentTimings, diagnosticsHeader: response.appointmentDiagnostics }
      : { kind: 'error', message, durationMs: response.durationMs, httpStatus: response.status, requestId: response.requestId, timings: response.appointmentTimings, diagnosticsHeader: response.appointmentDiagnostics };
  }

  report({ vuReports, startedAt, endedAt, durationSeconds, pacingMs, maxWritesPerUser }) {
    const created = { appointments: [], messages: [], conversations: [] };
    for (const vu of vuReports) {
      created.appointments.push(...vu.created.appointments);
      created.messages.push(...vu.created.messages);
      created.conversations.push(...vu.created.conversations);
    }
    const distribution = Object.fromEntries(this.fixture.barbershops.map(shop => [shop.id, {
      name: shop.name,
      writeAttempts: 0,
      successfulAppointments: 0,
      messages: 0,
      expectedConflicts: 0,
      realFailures: 0,
    }]));
    for (const vu of vuReports) {
      const bucket = distribution[vu.barbershopId];
      bucket.writeAttempts += vu.writeAttempts;
      bucket.successfulAppointments += vu.created.appointments.length;
      bucket.messages += vu.created.messages.length;
      bucket.expectedConflicts += vu.expectedConflicts;
      bucket.realFailures += vu.errors;
    }
    const distributionByProfessional = {};
    for (const professional of this.fixture.professionals) {
      distributionByProfessional[professional.id] = {
        name: professional.fullName,
        barbershopId: this.fixture.barbershops.find(shop => shop.ownerId === professional.id)?.id ?? null,
        writeAttempts: 0,
        successfulAppointments: 0,
        messages: 0,
        expectedConflicts: 0,
        realFailures: 0,
      };
    }
    for (const vu of vuReports) {
      const bucket = distributionByProfessional[vu.professionalId];
      if (!bucket) continue;
      bucket.writeAttempts += vu.writeAttempts;
      bucket.successfulAppointments += vu.created.appointments.length;
      bucket.messages += vu.created.messages.length;
      bucket.expectedConflicts += vu.expectedConflicts;
      bucket.realFailures += vu.errors;
    }
    const durations = this.metrics.map(item => item.durationMs).filter(Number.isFinite);
    const domainMetrics = ExpandedFixtureWriteRunner.summarizeMetricsByDomain(this.metrics);
    const summary = {
      vus: vuReports.length,
      iterations: vuReports.reduce((sum, vu) => sum + vu.iterations, 0),
      writeAttempts: vuReports.reduce((sum, vu) => sum + vu.writeAttempts, 0),
      successfulWriteIterations: vuReports.reduce((sum, vu) => sum + vu.writeIterations, 0),
      writesSucceeded: vuReports.reduce((sum, vu) => sum + vu.writes, 0),
      expectedConflicts: vuReports.reduce((sum, vu) => sum + vu.expectedConflicts, 0),
      realFailures: vuReports.reduce((sum, vu) => sum + vu.errors, 0),
      inconsistencies: vuReports.reduce((sum, vu) => sum + vu.inconsistencies, 0),
      skipsByWriteLimit: vuReports.reduce((sum, vu) => sum + vu.skipsByWriteLimit, 0),
      requests: this.metrics.length,
      http4xx: this.metrics.filter(item => item.status >= 400 && item.status < 500).length,
      http5xx: this.metrics.filter(item => item.status >= 500).length,
      timeouts: this.metrics.filter(item => item.timeout).length,
      realErrorRate: vuReports.reduce((sum, vu) => sum + vu.writeAttempts, 0)
        ? vuReports.reduce((sum, vu) => sum + vu.errors, 0) / vuReports.reduce((sum, vu) => sum + vu.writeAttempts, 0)
        : 0,
      latencyMs: {
        p50: ExpandedFixtureWriteRunner.percentile(durations, 50),
        p95: ExpandedFixtureWriteRunner.percentile(durations, 95),
        p99: ExpandedFixtureWriteRunner.percentile(durations, 99),
        max: durations.length ? Math.max(...durations) : null,
      },
      domainMetrics,
    };
    return {
      action: 'expanded-smoke-write',
      status: summary.realFailures > 0 || summary.inconsistencies > 0 || summary.http5xx > 0 || summary.timeouts > 0 ? 'error' : 'ok',
      baseUrl: this.baseUrl,
      runId: this.fixture.runId,
      executionId: this.executionId,
      generatedAt: new Date().toISOString(),
      duration: { targetSeconds: durationSeconds, pacingMs, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), actualMs: endedAt.getTime() - startedAt.getTime() },
      limits: { maxWritesPerUser },
      summary,
      distributionByBarbershop: distribution,
      distributionByProfessional,
      vuAssignments: vuReports.map(vu => vu.assignment),
      vus: vuReports,
      created,
    };
  }

  async validate(report) {
    const appointments = await this.admin.select('appointments', report.created.appointments);
    const messages = await this.admin.select('chat_messages', report.created.messages);
    const expectedClientMessageIds = report.vus.flatMap(vu => vu.checks
      .filter(check => check.name === 'chat_enviar_mensagem' && check.status === 'ok')
      .map(check => check.clientMessageId));
    const messagesByClientId = await this.admin.selectMessagesByClientIds(expectedClientMessageIds);
    const appointmentLinksOk = appointments.every(appointment => {
      const vu = report.vus.find(item => item.created.appointments.includes(appointment.id));
      return vu && appointment.barbershop_id === vu.barbershopId && appointment.professional_id === vu.professionalId;
    });
    const clientMessageCounts = Object.fromEntries(expectedClientMessageIds
      .map(id => [id, messagesByClientId.filter(message => message.client_message_id === id).length]));
    return {
      appointmentFoundCount: appointments.length,
      messageFoundCount: messages.length,
      appointmentLinksOk,
      duplicateAppointmentIds: report.created.appointments.filter(id => appointments.filter(item => item.id === id).length !== 1),
      duplicateMessageIds: report.created.messages.filter(id => messages.filter(item => item.id === id).length !== 1),
      clientMessageCounts,
      duplicateClientMessageIds: Object.entries(clientMessageCounts).filter(([, count]) => count > 1).map(([id]) => id),
    };
  }

  data(response) {
    return response?.body?.dados ?? response?.body?.data ?? response?.body;
  }

  errorMessage(response) {
    return response?.error ?? response?.body?.erro ?? response?.body?.error ?? response?.body?.message ?? `HTTP ${response?.status ?? 0}`;
  }

  isExpectedConflict(response, message) {
    const normalized = String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return response.status === 409 || [
      'horario nao disponivel',
      'horario ocupado',
      'cadeira ocupada',
      'posicao indisponivel',
      'conflito com agendamento',
      'conflito de agenda',
    ].some(text => normalized.includes(text));
  }

  payload(seed) {
    return {
      v: 1,
      alg: 'AES-GCM-256',
      iv: Buffer.from(`iv:${seed}`).toString('base64').slice(0, 24),
      ct: Buffer.from(`loadtest:${seed}`).toString('base64'),
      kid: 'loadtest',
    };
  }

  scheduledAtForLoad(value) {
    const offsetDays = Number.parseInt(process.env.LOADTEST_SLOT_OFFSET_DAYS || '0', 10);
    if (!Number.isFinite(offsetDays) || offsetDays === 0) return value;
    return new Date(new Date(value).getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  }

  static assertAllowedVus(vus) {
    if (![1, 7, 14, 28, 56].includes(Number(vus))) {
      throw new Error(`VUs nao autorizados para harness de escrita expandido: ${vus}.`);
    }
  }

  static summarizeMetricsByDomain(metrics) {
    const domains = {
      agendamento: [],
      chat: [],
      leitura: [],
      cleanup: [],
      unknown: [],
    };
    for (const metric of metrics) {
      const key = domains[metric.domain] ? metric.domain : 'unknown';
      domains[key].push(metric);
    }
    return Object.fromEntries(Object.entries(domains).map(([domain, items]) => {
      const durations = items.map(item => item.durationMs).filter(Number.isFinite);
      const byPhase = {};
      for (const item of items) {
        const phase = item.phase || 'unknown';
        byPhase[phase] ??= { requests: 0, errors: 0, timeouts: 0, p50: null, p95: null, p99: null, max: null, durations: [] };
        byPhase[phase].requests += 1;
        if (!item.ok) byPhase[phase].errors += 1;
        if (item.timeout) byPhase[phase].timeouts += 1;
        if (Number.isFinite(item.durationMs)) byPhase[phase].durations.push(item.durationMs);
      }
      for (const phase of Object.values(byPhase)) {
        phase.p50 = ExpandedFixtureWriteRunner.percentile(phase.durations, 50);
        phase.p95 = ExpandedFixtureWriteRunner.percentile(phase.durations, 95);
        phase.p99 = ExpandedFixtureWriteRunner.percentile(phase.durations, 99);
        phase.max = phase.durations.length ? Math.max(...phase.durations) : null;
        delete phase.durations;
      }
      const chatDiagnostics = domain === 'chat'
        ? ExpandedFixtureWriteRunner.summarizeChatDiagnostics(items)
        : {};
      return [domain, {
        requests: items.length,
        errors: items.filter(item => !item.ok).length,
        http4xx: items.filter(item => item.status >= 400 && item.status < 500).length,
        http5xx: items.filter(item => item.status >= 500).length,
        timeouts: items.filter(item => item.timeout).length,
        p50: ExpandedFixtureWriteRunner.percentile(durations, 50),
        p95: ExpandedFixtureWriteRunner.percentile(durations, 95),
        p99: ExpandedFixtureWriteRunner.percentile(durations, 99),
        max: durations.length ? Math.max(...durations) : null,
        byPhase,
        ...chatDiagnostics,
      }];
    }));
  }

  static summarizeChatDiagnostics(items) {
    const breakdown = {};
    const headerItems = items.filter(item => item.chatDiagnostics);
    for (const item of headerItems) {
      for (const [step, value] of Object.entries(item.chatTimings ?? {})) {
        if (!Number.isFinite(value)) continue;
        breakdown[step] ??= [];
        breakdown[step].push(value);
      }
    }
    const chatBreakdown = Object.fromEntries(Object.entries(breakdown).map(([step, values]) => [step, {
      p50: ExpandedFixtureWriteRunner.percentile(values, 50),
      p95: ExpandedFixtureWriteRunner.percentile(values, 95),
      p99: ExpandedFixtureWriteRunner.percentile(values, 99),
      max: values.length ? Math.max(...values) : null,
      samples: values.length,
    }]));
    const topChatBottlenecks = Object.entries(chatBreakdown)
      .map(([step, stats]) => ({ step, p95: stats.p95, max: stats.max, samples: stats.samples }))
      .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
      .slice(0, 5);
    return {
      chatDiagnosticsHeaderCount: headerItems.length,
      chatDiagnosticsMissingCount: items.length - headerItems.length,
      chatBreakdown,
      topChatBottlenecks,
    };
  }
}

class ExpandedFixtureRunCli {
  static async main() {
    const fixturePath = path.resolve(process.env.LOADTEST_EXPANDED_FIXTURE_REPORT || '');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const admin = new ExpandedFixtureSupabaseAdmin({
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const runner = new ExpandedFixtureWriteRunner({
      admin,
      fixture,
      baseUrl: process.env.LOADTEST_BASE_URL || 'https://bff.berberflow.shop',
    });
    const vus = Number.parseInt(process.env.LOADTEST_VUS || '28', 10);
    ExpandedFixtureWriteRunner.assertAllowedVus(vus);
    const assignments = runner.assignments().slice(0, vus);
    const tokenStatus = await runner.prepareTokens(assignments);
    const report = await runner.run({
      vus,
      durationSeconds: Number.parseInt(process.env.LOADTEST_DURATION_SECONDS || '30', 10),
      pacingMs: Number.parseInt(process.env.LOADTEST_PACING_MS || '1500', 10),
      maxWritesPerUser: Number.parseInt(process.env.LOADTEST_MAX_WRITES_PER_USER || '1', 10),
    });
    report.tokenStatus = { users: tokenStatus.users, tokenValuesPrinted: false };
    const outputPath = path.resolve('docs', 'perf', 'load-results', `${new Date().toISOString().replace(/[:.]/g, '-')}_${fixture.runId}_expanded-${vus}vus.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      outputPath,
      status: report.status,
      duration: report.duration,
      summary: report.summary,
      chatDiagnostics: report.summary?.domainMetrics?.chat
        ? {
          headerCount: report.summary.domainMetrics.chat.chatDiagnosticsHeaderCount,
          missingCount: report.summary.domainMetrics.chat.chatDiagnosticsMissingCount,
          topBottlenecks: report.summary.domainMetrics.chat.topChatBottlenecks,
        }
        : null,
      validation: report.validation,
      cleanupDryRun: report.cleanupDryRun,
    }, null, 2));
  }
}

if (require.main === module) {
  ExpandedFixtureRunCli.main().catch((err) => {
    console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  ExpandedFixtureSupabaseAdmin,
  ExpandedFixtureHttpClient,
  ExpandedFixtureWriteRunner,
  ExpandedFixtureRunCli,
};
