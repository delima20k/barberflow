'use strict';

// =============================================================================
// tests/external-cron.test.js
//
// GET /api/external/cron/queue-presence-nudge — gatilho de servico externo
// (cron-job.org) para o lembrete recorrente de presenca (Etapa 9). Cobre:
//   - 401 sem/com header x-cron-secret errado
//   - 200 { ok:false, reason:'PUSH_UNAVAILABLE' } quando VAPID nao configurado
//   - 200 { ok:true } no caminho feliz (sem candidatos -- nao precisa
//     simular envio de push real)
// =============================================================================

const { describe, test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');

const SECRET = 'test-cron-secret-000000000000000000000000';

let origSecret;
let origPub;
let origPriv;
let origSubject;

before(() => {
  origSecret  = process.env.QUEUE_PRESENCE_CRON_SECRET;
  origPub     = process.env.VAPID_PUBLIC_KEY;
  origPriv    = process.env.VAPID_PRIVATE_KEY;
  origSubject = process.env.VAPID_SUBJECT;
  process.env.QUEUE_PRESENCE_CRON_SECRET = SECRET;
});

after(() => {
  process.env.QUEUE_PRESENCE_CRON_SECRET = origSecret;
  process.env.VAPID_PUBLIC_KEY  = origPub;
  process.env.VAPID_PRIVATE_KEY = origPriv;
  process.env.VAPID_SUBJECT     = origSubject;
});

// Fake query builder Supabase-like: encadeia select/eq/not/is/or/limit e
// resolve como uma Promise de { data, error } — suficiente para
// QueuePresenceRepository.listarCandidatosParaLembrete().
function fakeDbSemCandidatos() {
  const resultado = { data: [], error: null };
  const builder = {
    select: () => builder,
    eq:     () => builder,
    not:    () => builder,
    is:     () => builder,
    or:     () => builder,
    in:     () => builder,
    limit:  () => Promise.resolve(resultado),
    then:   (resolve) => resolve(resultado), // .select(...).eq(...) sem limit() tambem e thenable
  };
  return { from: () => builder };
}

function criarApp(db) {
  const criarExternalCronRoute = require('../routes/externalCron');
  const app = express();
  app.use('/api/external/cron', criarExternalCronRoute(db));
  return app;
}

async function chamar(app, headers = {}) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const port = server.address().port;
    const res  = await fetch(`http://127.0.0.1:${port}/api/external/cron/queue-presence-nudge`, { headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('GET /api/external/cron/queue-presence-nudge', () => {
  test('401 sem header x-cron-secret', async () => {
    const app = criarApp(fakeDbSemCandidatos());
    const { status, body } = await chamar(app);
    assert.equal(status, 401);
    assert.equal(body.ok, false);
  });

  test('401 com x-cron-secret errado', async () => {
    const app = criarApp(fakeDbSemCandidatos());
    const { status } = await chamar(app, { 'x-cron-secret': 'valor-errado' });
    assert.equal(status, 401);
  });

  test('200 PUSH_UNAVAILABLE quando VAPID nao configurado', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const app = criarApp(fakeDbSemCandidatos());
    const { status, body } = await chamar(app, { 'x-cron-secret': SECRET });

    assert.equal(status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'PUSH_UNAVAILABLE');
  });

  test('200 ok quando secret correto, VAPID configurado e sem candidatos', async () => {
    // Par VAPID valido de descarte, gerado so para este teste (web-push
    // valida o tamanho em bytes das chaves ao decodificar base64url).
    process.env.VAPID_PUBLIC_KEY  = 'BElbcAzpKExVJTmLOWMfFO5o_EdCqZJucW-f5gv7cJb8yA9WKrB5X-OtPqNI3MJMKOwqWMQcZp8Y2-eWKcSra4M';
    process.env.VAPID_PRIVATE_KEY = '1y0GbpmXiNrSVJlUA5lxBa9dOF1VW4-rytcoxo5rEcg';
    process.env.VAPID_SUBJECT     = 'mailto:test@barberflow.app';

    const app = criarApp(fakeDbSemCandidatos());
    const { status, body } = await chamar(app, { 'x-cron-secret': SECRET });

    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });
});
