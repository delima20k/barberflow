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
  assert.match(request.body.subject, /cadastro/i);
  assert.match(request.body.html, /&lt;User&gt;/);
  assert.doesNotMatch(request.body.html, /<User>/);
});

test('ResendEmailService registra falha do provider sem lancar excecao', async () => {
  const logger = makeLogger();
  const svc = new ResendEmailService({
    apiKey: 're_test',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid from' }),
    }),
    logger,
  });

  const result = await svc.sendPasswordChangedNotification('user@example.com', 'User');

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /Invalid from/);
  assert.equal(logger.entries.at(-1)[0], 'error');
});
