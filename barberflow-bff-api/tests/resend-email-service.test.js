'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ResendEmailService } = require('../infrastructure/email/ResendEmailService');

function makeLogger() {
  return {
    entries: [],
    info(...args) { this.entries.push(['info', ...args]); },
    warn(...args) { this.entries.push(['warn', ...args]); },
    error(...args) { this.entries.push(['error', ...args]); },
  };
}

function flattenLogs(logger) {
  return JSON.stringify(logger.entries);
}

test('ResendEmailService pula envio sem RESEND_API_KEY e nao quebra fluxo', async () => {
  let called = false;
  const logger = makeLogger();
  const svc = new ResendEmailService({
    apiKey: '',
    fetchImpl: async () => { called = true; },
    logger,
  });

  const result = await svc.sendPasswordReset('user@example.com', 'User', 'https://app.barberflow.live/reset', 60);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(called, false);
  assert.equal(logger.entries[0][0], 'warn');
});

test('ResendEmailService envia payload correto para Resend', async () => {
  let request;
  const svc = new ResendEmailService({
    apiKey: 're_test',
    from: 'BarberFlow <noreply@barberflow.live>',
    baseUrl: 'https://resend.test',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
    },
    logger: makeLogger(),
  });

  const result = await svc.sendSignupConfirmation(
    'user@example.com',
    '<User>',
    'https://app.barberflow.live/confirm?token=abc',
  );

  assert.deepEqual(result, { ok: true, providerId: 'email_123' });
  assert.strictEqual(request.url, 'https://resend.test/emails');
  assert.strictEqual(request.options.method, 'POST');
  assert.strictEqual(request.options.headers.Authorization, 'Bearer re_test');
  assert.strictEqual(request.body.from, 'BarberFlow <noreply@barberflow.live>');
  assert.deepEqual(request.body.to, ['user@example.com']);
  assert.match(request.body.subject, /BarberFlow Cliente/);
  assert.match(request.body.html, /&lt;User&gt;/);
  assert.match(request.body.html, /BarberFlow Cliente/);
  assert.doesNotMatch(request.body.html, /<User>/);
});

test('ResendEmailService identifica app profissional pelo link de recuperacao', async () => {
  let request;
  const svc = new ResendEmailService({
    apiKey: 're_test',
    baseUrl: 'https://resend.test',
    fetchImpl: async (_url, options) => {
      request = { body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ id: 'email_456' }) };
    },
    logger: makeLogger(),
  });

  await svc.sendPasswordReset('user@example.com', 'User', 'https://pro.barberflow.live/redefinir', 60);

  assert.match(request.body.subject, /BarberFlow Profissional/);
  assert.match(request.body.html, /BarberFlow Profissional/);
});

test('ResendEmailService registra 4xx do provider sem retry e sem dados sensiveis', async () => {
  const logger = makeLogger();
  let calls = 0;
  const svc = new ResendEmailService({
    apiKey: 're_secret_test_key',
    fetchImpl: async () => {
      calls += 1;
      return {
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid from' }),
      };
    },
    logger,
  });

  const result = await svc.sendPasswordChangedNotification('user@example.com', 'User');

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Invalid from/);
  assert.strictEqual(calls, 1);
  assert.equal(logger.entries.at(-1)[0], 'error');
  const logs = flattenLogs(logger);
  assert.doesNotMatch(logs, /re_secret_test_key/);
  assert.doesNotMatch(logs, /user@example\.com/);
  assert.match(logs, /u\*\*\*@example\.com/);
});

test('ResendEmailService faz retry em 5xx e retorna falha controlada', async () => {
  const logger = makeLogger();
  let calls = 0;
  const svc = new ResendEmailService({
    apiKey: 're_secret_test_key',
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: 'Service unavailable' }),
      };
    },
    logger,
  });

  const result = await svc.sendPasswordReset('user@example.com', 'User', 'https://app.barberflow.live/reset', 60);

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Service unavailable/);
  assert.strictEqual(calls, 3);
  const logs = flattenLogs(logger);
  assert.doesNotMatch(logs, /re_secret_test_key/);
  assert.doesNotMatch(logs, /user@example\.com/);
});

test('ResendEmailService trata timeout sem lancar excecao nem vazar segredo', async () => {
  const logger = makeLogger();
  let calls = 0;
  const svc = new ResendEmailService({
    apiKey: 're_secret_test_key',
    fetchImpl: async () => {
      calls += 1;
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    },
    logger,
  });

  const result = await svc.sendSignupConfirmation('user@example.com', 'User', 'https://app.barberflow.live/confirm');

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /aborted/i);
  assert.strictEqual(calls, 3);
  const logs = flattenLogs(logger);
  assert.doesNotMatch(logs, /re_secret_test_key/);
  assert.doesNotMatch(logs, /user@example\.com/);
});

test('ResendEmailService envia feedback da landing ao contato fixado pelo caso de uso', async () => {
  let request;
  const svc = new ResendEmailService({
    apiKey: 're_test',
    baseUrl: 'https://resend.test',
    fetchImpl: async (_url, options) => {
      request = { body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ id: 'email_feedback_1' }) };
    },
    logger: makeLogger(),
  });

  const result = await svc.sendLandingFeedback('contato@barberflow.live', {
    name: '<Ana>',
    email: 'ana@example.com',
    type: 'Sugestão',
    subject: 'Fila <script>',
    message: 'Melhorar <b>a fila</b>.',
    privacyConsent: true,
    submittedAt: '2026-07-21T12:00:00.000Z',
    origin: 'Landing Page BarberFlow',
  });

  assert.deepEqual(result, { ok: true, providerId: 'email_feedback_1' });
  assert.deepEqual(request.body.to, ['contato@barberflow.live']);
  assert.equal(request.body.subject, 'Nova mensagem da Landing BarberFlow');
  assert.match(request.body.html, /&lt;Ana&gt;/);
  assert.match(request.body.html, /Fila &lt;script&gt;/);
  assert.match(request.body.html, /Melhorar &lt;b&gt;a fila&lt;\/b&gt;\./);
  assert.doesNotMatch(request.body.html, /<script>|<b>a fila<\/b>/);
});
