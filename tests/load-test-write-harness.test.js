'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestMemoryClient,
} = require('../load-tests/write/WriteLoadTestHarness');
const {
  ExpandedFixtureWriteRunner,
} = require('../load-tests/write/run-expanded-fixture');

const REQUIRED_ENV = Object.freeze({
  LOADTEST_ENABLE_WRITES: 'true',
  LOADTEST_RUN_ID: 'loadtest_write_20260611_120000',
  LOADTEST_EXECUTION_ID: 'exec001',
  LOADTEST_CLIENT_TOKEN: 'client.jwt',
  LOADTEST_PROFESSIONAL_TOKEN: 'professional.jwt',
  LOADTEST_BARBERSHOP_ID: '11111111-1111-4111-8111-111111111111',
  LOADTEST_PROFESSIONAL_ID: '22222222-2222-4222-8222-222222222222',
  LOADTEST_SERVICE_ID: '33333333-3333-4333-8333-333333333333',
  LOADTEST_CONVERSATION_ID: '44444444-4444-4444-8444-444444444444',
});

describe('WriteLoadTestConfig', () => {
  it('deve bloquear escrita quando LOADTEST_ENABLE_WRITES nao estiver true', () => {
    assert.throws(() => new WriteLoadTestConfig({
      env: { ...REQUIRED_ENV, LOADTEST_ENABLE_WRITES: 'false' },
    }), /LOADTEST_ENABLE_WRITES=true/);
  });

  it('deve bloquear quando faltar env obrigatorio', () => {
    const env = { ...REQUIRED_ENV };
    delete env.LOADTEST_SERVICE_ID;

    assert.throws(() => new WriteLoadTestConfig({ env }), /LOADTEST_SERVICE_ID/);
  });

  it('deve exigir run id isolado com prefixo loadtest_write', () => {
    assert.throws(() => new WriteLoadTestConfig({
      env: { ...REQUIRED_ENV, LOADTEST_RUN_ID: 'manual_prod' },
    }), /LOADTEST_RUN_ID/);
  });

  it('deve manter push real desativado', () => {
    assert.throws(() => new WriteLoadTestConfig({
      env: { ...REQUIRED_ENV, LOADTEST_ENABLE_PUSH: 'true' },
    }), /push real/);
  });

  it('deve aplicar limite seguro de writes por usuario por padrao', () => {
    const config = new WriteLoadTestConfig({ env: REQUIRED_ENV });

    assert.equal(config.maxWritesPerUser, 1);
    assert.equal(config.pacingMs, 1500);
  });
});

describe('WriteLoadTestHarness', () => {
  it('deve montar payload de agendamento com run id e Idempotency-Key', async () => {
    const client = new WriteLoadTestMemoryClient();
    const config = new WriteLoadTestConfig({ env: REQUIRED_ENV });
    const harness = new WriteLoadTestHarness({ config, client });

    client.enqueue({ status: 201, ok: true, body: {
      ok: true,
      dados: {
        id: '55555555-5555-4555-8555-555555555555',
        barbershop_id: REQUIRED_ENV.LOADTEST_BARBERSHOP_ID,
        professional_id: REQUIRED_ENV.LOADTEST_PROFESSIONAL_ID,
        service_id: REQUIRED_ENV.LOADTEST_SERVICE_ID,
      },
    } });
    client.enqueue({ status: 200, ok: true, body: { ok: true, dados: [] } });
    client.enqueue({ status: 201, ok: true, body: {
      ok: true,
      dados: { id: '66666666-6666-4666-8666-666666666666', clientMessageId: `${REQUIRED_ENV.LOADTEST_RUN_ID}:exec001:chat:1:1` },
    } });
    client.enqueue({ status: 200, ok: true, body: { ok: true, dados: [] } });

    const report = await harness.runSmokeOnce({ vu: 1, iteration: 1 });
    const appointmentCall = client.calls.find(call => call.path === '/api/agendamentos');
    const chatCall = client.calls.find(call => call.path.includes('/messages'));

    assert.equal(report.status, 'ok');
    assert.equal(appointmentCall.method, 'POST');
    assert.equal(appointmentCall.token, REQUIRED_ENV.LOADTEST_CLIENT_TOKEN);
    assert.equal(appointmentCall.body.barbershop_id, REQUIRED_ENV.LOADTEST_BARBERSHOP_ID);
    assert.match(appointmentCall.body.notes, /loadtest_write_20260611_120000/);
    assert.equal(appointmentCall.headers['Idempotency-Key'], `${REQUIRED_ENV.LOADTEST_RUN_ID}:exec001:appointment:1:1`);
    assert.equal(appointmentCall.headers['X-BarberFlow-Diagnostics'], 'appointment');
    assert.equal(chatCall.body.clientMessageId, `${REQUIRED_ENV.LOADTEST_RUN_ID}:exec001:chat:1:1`);
    assert.equal(chatCall.headers['X-BarberFlow-Diagnostics'], 'chat');
    assert.deepEqual(report.created.appointments, ['55555555-5555-4555-8555-555555555555']);
  });

  it('deve manter cleanup em dry-run por padrao', async () => {
    const client = new WriteLoadTestMemoryClient();
    const config = new WriteLoadTestConfig({ env: REQUIRED_ENV });
    const harness = new WriteLoadTestHarness({ config, client });

    const report = await harness.cleanup({
      appointments: ['55555555-5555-4555-8555-555555555555'],
      messages: ['66666666-6666-4666-8666-666666666666'],
    });

    assert.equal(report.mode, 'dry-run');
    assert.equal(client.calls.length, 0);
  });

  it('deve executar loop ate a duracao e registrar skips por limite de writes', async () => {
    const client = new WriteLoadTestMemoryClient();
    const clock = {
      current: new Date('2026-06-12T10:00:00.000Z'),
      now() { return this.current; },
      sleep(ms) { this.current = new Date(this.current.getTime() + ms); },
    };
    const config = new WriteLoadTestConfig({
      env: {
        ...REQUIRED_ENV,
        LOADTEST_DURATION_SECONDS: '3',
        LOADTEST_PACING_MS: '1000',
        LOADTEST_MAX_WRITES_PER_USER: '1',
      },
      now: clock.now(),
    });
    const harness = new WriteLoadTestHarness({
      config,
      client,
      clock,
      sleeper: async (ms) => clock.sleep(ms),
    });

    client.enqueue({ status: 201, ok: true, body: {
      ok: true,
      dados: {
        id: '55555555-5555-4555-8555-555555555555',
        barbershop_id: REQUIRED_ENV.LOADTEST_BARBERSHOP_ID,
        professional_id: REQUIRED_ENV.LOADTEST_PROFESSIONAL_ID,
        service_id: REQUIRED_ENV.LOADTEST_SERVICE_ID,
      },
    } });
    client.enqueue({ status: 404, ok: false, body: { error: 'not found' } });
    client.enqueue({ status: 201, ok: true, body: {
      ok: true,
      dados: { id: '66666666-6666-4666-8666-666666666666' },
    } });

    const report = await harness.runForDuration();

    assert.equal(report.status, 'ok');
    assert.equal(report.duration.targetSeconds, 3);
    assert.equal(report.duration.actualMs, 3000);
    assert.equal(report.vus.length, 1);
    assert.equal(report.vus[0].iterations, 3);
    assert.equal(report.vus[0].writeAttempts, 1);
    assert.equal(report.vus[0].writeIterations, 1);
    assert.equal(report.vus[0].writes, 2);
    assert.equal(report.vus[0].skipsByWriteLimit, 2);
    assert.equal(report.writesPerformed, 2);
    assert.equal(client.calls.filter(call => call.method === 'POST').length, 2);
  });

  it('deve classificar conflito de agenda esperado como resultado controlado', async () => {
    const client = new WriteLoadTestMemoryClient();
    const clock = {
      current: new Date('2026-06-12T10:00:00.000Z'),
      now() { return this.current; },
      sleep(ms) { this.current = new Date(this.current.getTime() + ms); },
    };
    const config = new WriteLoadTestConfig({
      env: {
        ...REQUIRED_ENV,
        LOADTEST_DURATION_SECONDS: '2',
        LOADTEST_PACING_MS: '1000',
        LOADTEST_MAX_WRITES_PER_USER: '1',
      },
      now: clock.now(),
    });
    const harness = new WriteLoadTestHarness({
      config,
      client,
      clock,
      sleeper: async (ms) => clock.sleep(ms),
    });

    client.enqueue({
      status: 400,
      ok: false,
      body: { erro: 'Horario nao disponivel: conflito com agendamento existente.' },
      durationMs: 7,
    });

    const report = await harness.runForDuration();

    assert.equal(report.status, 'ok');
    assert.equal(report.summary.successfulWriteIterations, 0);
    assert.equal(report.summary.expectedConflicts, 1);
    assert.equal(report.summary.realFailures, 0);
    assert.equal(report.vus[0].expectedConflicts, 1);
    assert.equal(report.vus[0].errors, 0);
    assert.equal(report.checks[0].status, 'expected-conflict');
  });
});

describe('ExpandedFixtureWriteRunner', () => {
  it('deve distribuir 28 VUs em round-robin justo entre 7 barbearias', () => {
    const fixture = buildExpandedFixture();
    const runner = new ExpandedFixtureWriteRunner({ admin: null, fixture, baseUrl: 'https://bff.berberflow.shop' });

    const assignments = runner.assignments().slice(0, 28);
    const counts = assignments.reduce((acc, assignment) => {
      acc[assignment.slot.barbershopId] = (acc[assignment.slot.barbershopId] ?? 0) + 1;
      return acc;
    }, {});

    assert.equal(assignments.length, 28);
    assert.deepEqual(assignments.slice(0, 7).map(item => item.slot.barbershopId), fixture.barbershops.map(shop => shop.id));
    assert.deepEqual(Object.values(counts), [4, 4, 4, 4, 4, 4, 4]);
    assert.equal(new Set(assignments.map(item => item.client.id)).size, 28);
  });

  it('deve bloquear execucao expandida com 100 VUs', async () => {
    const fixture = buildExpandedFixture();
    const runner = new ExpandedFixtureWriteRunner({ admin: null, fixture, baseUrl: 'https://bff.berberflow.shop' });

    await assert.rejects(
      () => runner.run({ vus: 100, durationSeconds: 1, pacingMs: 1, maxWritesPerUser: 1 }),
      /VUs nao autorizados/,
    );
  });

  it('deve continuar chat quando agendamento tiver conflito esperado', async () => {
    const fixture = buildExpandedFixture();
    const runner = new ExpandedFixtureWriteRunner({ admin: null, fixture, baseUrl: 'https://bff.berberflow.shop' });
    const assignment = runner.assignments()[0];
    runner.tokens.set(assignment.client.id, 'client.jwt');
    runner.tokens.set(assignment.professional.id, 'professional.jwt');
    runner.createAppointment = async () => ({
      kind: 'expected-conflict',
      message: 'Horario nao disponivel',
      durationMs: 10,
      httpStatus: 409,
      requestId: 'req-appointment',
      timings: { total_handler: 10 },
      diagnosticsHeader: 'total_handler=10',
    });
    runner.http = {
      async get() {
        return { ok: true, status: 200, durationMs: 5, requestId: 'req-queue' };
      },
      async post(pathname) {
        if (pathname === '/api/v1/chat/conversations') {
          return { ok: true, status: 201, body: { dados: { id: 'conversation-1' } }, durationMs: 7, requestId: 'req-conversation' };
        }
        return {
          ok: true,
          status: 201,
          body: { dados: { id: 'message-1' } },
          durationMs: 9,
          requestId: 'req-message',
          chatDiagnostics: 'auth=1;total_handler=9',
          chatTimings: { auth: 1, total_handler: 9 },
        };
      },
    };
    const state = {
      vu: assignment.vu,
      barbershopId: assignment.slot.barbershopId,
      professionalId: assignment.slot.professionalId,
      clientId: assignment.client.id,
      iterations: 1,
      writeAttempts: 1,
      writeIterations: 0,
      writes: 0,
      skipsByWriteLimit: 0,
      expectedConflicts: 0,
      errors: 0,
      inconsistencies: 0,
      checks: [],
      created: { appointments: [], messages: [], conversations: [] },
    };

    await runner.executeWriteAttempt({ state, assignment });

    assert.equal(state.expectedConflicts, 1);
    assert.equal(state.errors, 0);
    assert.equal(state.writeIterations, 1);
    assert.equal(state.writes, 1);
    assert.deepEqual(state.created.messages, ['message-1']);
    assert.ok(state.checks.some(check => check.name === 'chat_enviar_mensagem' && check.diagnosticsHeader === 'auth=1;total_handler=9'));
  });

  it('deve separar metricas por dominio e fase', () => {
    const metrics = [
      { domain: 'agendamento', phase: 'agendamento_criar', ok: true, status: 201, durationMs: 100, timeout: false },
      { domain: 'chat', phase: 'chat_criar_conversa', ok: true, status: 201, durationMs: 200, timeout: false },
      { domain: 'chat', phase: 'chat_enviar_mensagem', ok: false, status: 0, durationMs: 8000, timeout: true },
      { domain: 'leitura', phase: 'fila_rota_real', ok: false, status: 404, durationMs: 30, timeout: false },
    ];

    const summary = ExpandedFixtureWriteRunner.summarizeMetricsByDomain(metrics);

    assert.equal(summary.agendamento.requests, 1);
    assert.equal(summary.chat.requests, 2);
    assert.equal(summary.chat.timeouts, 1);
    assert.equal(summary.chat.byPhase.chat_enviar_mensagem.timeouts, 1);
    assert.equal(summary.leitura.http4xx, 1);
  });

  it('deve agregar diagnostico de chat e apontar gargalos por etapa', () => {
    const metrics = [
      {
        domain: 'chat',
        phase: 'chat_enviar_mensagem',
        ok: true,
        status: 201,
        durationMs: 120,
        timeout: false,
        chatDiagnostics: 'auth=2;findByClientMessageId=10;findConversation=20;participantsChecks=3;rateLimitBloqueio=4;saveMessage=30;outboxSave=12;realtimePublish=scheduled;total_handler=90',
        chatTimings: {
          auth: 2,
          findByClientMessageId: 10,
          findConversation: 20,
          participantsChecks: 3,
          rateLimitBloqueio: 4,
          saveMessage: 30,
          outboxSave: 12,
          realtimePublish: 'scheduled',
          total_handler: 90,
        },
      },
      {
        domain: 'chat',
        phase: 'chat_enviar_mensagem',
        ok: true,
        status: 201,
        durationMs: 140,
        timeout: false,
        chatDiagnostics: 'auth=3;findByClientMessageId=12;findConversation=22;participantsChecks=2;rateLimitBloqueio=5;saveMessage=34;outboxSave=15;realtimePublish=scheduled;total_handler=100',
        chatTimings: {
          auth: 3,
          findByClientMessageId: 12,
          findConversation: 22,
          participantsChecks: 2,
          rateLimitBloqueio: 5,
          saveMessage: 34,
          outboxSave: 15,
          realtimePublish: 'scheduled',
          total_handler: 100,
        },
      },
      {
        domain: 'chat',
        phase: 'chat_criar_conversa',
        ok: true,
        status: 201,
        durationMs: 80,
        timeout: false,
        chatDiagnostics: null,
        chatTimings: {},
      },
    ];

    const summary = ExpandedFixtureWriteRunner.summarizeMetricsByDomain(metrics);

    assert.equal(summary.chat.chatDiagnosticsHeaderCount, 2);
    assert.equal(summary.chat.chatDiagnosticsMissingCount, 1);
    assert.equal(summary.chat.chatBreakdown.saveMessage.p50, 30);
    assert.equal(summary.chat.chatBreakdown.saveMessage.p95, 34);
    assert.equal(summary.chat.chatBreakdown.total_handler.p99, 100);
    assert.equal(summary.chat.topChatBottlenecks[0].step, 'total_handler');
    assert.equal(summary.chat.topChatBottlenecks[1].step, 'saveMessage');
  });
});

function buildExpandedFixture() {
  const runId = 'loadtest_write_expanded_20260612155621';
  const barbershops = Array.from({ length: 7 }, (_, index) => ({
    id: `shop-${index + 1}`,
    name: `${runId} barbearia ${index + 1}`,
    ownerId: `pro-${index + 1}-1`,
  }));
  const professionals = barbershops.flatMap((shop, shopIndex) => Array.from({ length: 3 }, (_, proIndex) => ({
    id: `pro-${shopIndex + 1}-${proIndex + 1}`,
    fullName: `${runId} profissional ${shopIndex + 1}-${proIndex + 1}`,
    shopIndex: shopIndex + 1,
    proIndex: proIndex + 1,
  })));
  const clients = Array.from({ length: 28 }, (_, index) => ({
    id: `client-${index + 1}`,
    clientIndex: index + 1,
  }));
  const slotPlans = barbershops.flatMap((shop, shopIndex) => Array.from({ length: 12 }, (_, slotIndex) => ({
    barbershopId: shop.id,
    professionalId: `pro-${shopIndex + 1}-${(slotIndex % 3) + 1}`,
    serviceId: `service-${shopIndex + 1}-${(slotIndex % 2) + 1}`,
    scheduledAt: `2026-06-13T${String(9 + Math.floor(slotIndex / 2)).padStart(2, '0')}:${slotIndex % 2 === 0 ? '00' : '30'}:00.000Z`,
    durationMin: 30,
  })));
  return { runId, barbershops, professionals, clients, slotPlans };
}
