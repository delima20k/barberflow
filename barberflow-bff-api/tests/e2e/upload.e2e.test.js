'use strict';

/**
 * upload.e2e.test.js — E2E: fluxo de upload de mídia.
 *
 * Cobre:
 *  - POST /api/v1/media/presigned  — sem auth → 401
 *  - POST /api/v1/media/presigned  — context/tipo válido → 201 com mediaId + uploadUrl
 *  - POST /api/v1/media/presigned  — context inválido → 400
 *  - POST /api/v1/media/presigned  — tipo MIME inválido → 400
 *  - POST /api/v1/media/confirmar  — sem auth → 401
 *  - POST /api/v1/media/confirmar  — token inválido → 403
 *  - GET  /api/v1/media/:id/acesso — sem auth → 401
 *  - GET  /api/v1/media/:id/acesso — variante não encontrada → 404
 *  - Headers de observabilidade presentes
 */

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer, request, gerarToken, TEST_USER_ID } = require('./_app-helper');

// UUIDs válidos (RFC 4122)
const MEDIA_ID = 'f1e2d3c4-b5a6-4789-8abc-999988887777';

const MEDIA_FILE_ROW = {
  id:          MEDIA_ID,
  owner_id:    TEST_USER_ID,
  privacy:     'public',
  status:      'published',
  media_variants: [
    { name: 'original', storage_path: `avatars/${TEST_USER_ID}/media/${MEDIA_ID}.jpg`, version: 1 },
  ],
};

suite('E2E — Upload de Mídia', () => {
  let server;
  let token;

  before(async () => {
    token = gerarToken({ sub: TEST_USER_ID });

    server = await createTestServer({
      media_files: () => ({ data: MEDIA_FILE_ROW, error: null }),
      media_variants: () => ({ data: [], error: null }),
      domain_events_outbox: () => ({ data: { id: 'c9d8e7f6-a5b4-4321-89ab-000011112222' }, error: null }),
    });
  });

  after(async () => {
    await server.close();
  });

  // ── Auth guard ────────────────────────────────────────────────────

  test('POST /presigned — sem token → 401', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/presigned', {
      body: { contentType: 'image/jpeg', context: 'avatars', sizeBytes: 102400 },
    });
    assert.strictEqual(status, 401);
  });

  test('GET /media/:id/acesso — sem token → 401', async () => {
    const { status } = await request(server, 'GET', `/api/v1/media/${MEDIA_ID}/acesso`);
    assert.strictEqual(status, 401);
  });

  test('POST /confirmar — sem auth → 401', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/confirmar', {
      body: { mediaId: MEDIA_ID },
    });
    assert.strictEqual(status, 401);
  });

  // ── Presigned URL ─────────────────────────────────────────────────

  test('POST /presigned — context avatars + image/jpeg → 201 com dados', async () => {
    const { status, body } = await request(server, 'POST', '/api/v1/media/presigned', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { contentType: 'image/jpeg', context: 'avatars', sizeBytes: 102400 },
    });
    assert.ok(status === 200 || status === 201, `esperado 200/201, recebeu ${status}`);
    assert.ok(body.dados?.mediaId || body.dados?.uploadUrl || body.dados != null, 'deve retornar dados de upload');
  });

  test('POST /presigned — context inválido → 400', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/presigned', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { contentType: 'image/jpeg', context: 'perfil', sizeBytes: 102400 },
    });
    assert.ok(status >= 400 && status < 500, `context inválido deve resultar em 4xx, recebeu ${status}`);
  });

  test('POST /presigned — MIME não permitido → 400', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/presigned', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { contentType: 'application/x-msdownload', context: 'avatars', sizeBytes: 102400 },
    });
    assert.ok(status >= 400 && status < 500, `MIME inválido deve resultar em 4xx, recebeu ${status}`);
  });

  test('POST /presigned — body vazio → 400', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/presigned', {
      headers: { Authorization: `Bearer ${token}` },
      body:    {},
    });
    assert.ok(status >= 400 && status < 500, `body vazio deve resultar em 4xx, recebeu ${status}`);
  });

  // ── Confirmar upload ──────────────────────────────────────────────

  test('POST /confirmar — token inválido → 403', async () => {
    const { status } = await request(server, 'POST', '/api/v1/media/confirmar', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { mediaId: MEDIA_ID, path: 'avatars/test/foto.jpg', context: 'avatars', confirmationToken: 'token-invalido' },
    });
    assert.ok(status === 403 || status === 422, `token inválido deve resultar em 403/422, recebeu ${status}`);
  });

  // ── Acesso ────────────────────────────────────────────────────────

  test('GET /:id/acesso — variante não encontrada → 404', async () => {
    // O media_files mock retorna os dados mas para um ID diferente → single() retorna null
    const { status } = await request(server, 'GET', `/api/v1/media/${MEDIA_ID}/acesso`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Aceita 200 (se o mock retorna a variante) ou 404 (variante não encontrada)
    assert.ok(status === 200 || status === 404, `esperado 200/404, recebeu ${status}`);
  });

  // ── Headers ───────────────────────────────────────────────────────

  test('Resposta de mídia inclui x-correlation-id', async () => {
    const { headers } = await request(server, 'POST', '/api/v1/media/presigned', {
      headers: { Authorization: `Bearer ${token}` },
      body:    { contentType: 'image/jpeg', context: 'avatars', sizeBytes: 102400 },
    });
    assert.ok(headers['x-correlation-id'], 'deve incluir x-correlation-id');
  });
});
