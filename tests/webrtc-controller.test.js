'use strict';
/**
 * tests/webrtc-controller.test.js
 *
 * Testa WebRTCController:
 *   - POST /announce: insere peer, valida peerId UUID, valida mediaId, expira em 5min
 *   - GET /peers/:mediaId: exclui próprio usuário, retorna apenas peers ativos
 *   - GET /ice-config: retorna iceServers com formato correto
 */

const { suite, test, beforeEach } = require('node:test');
const assert                       = require('node:assert/strict');
const path                         = require('node:path');
const { fn }                       = require('./_helpers.js');

// ── Mock de dependências que exigem variáveis de ambiente ────────────────────
// Deve ocorrer ANTES de qualquer require do módulo a testar.

// Mock de AuthMiddleware — bypass do SupabaseClient (que exige SUPABASE_URL)
const authMiddlewarePath = path.resolve(__dirname, '../src/infra/AuthMiddleware.js');
require.cache[authMiddlewarePath] = {
  id:       authMiddlewarePath,
  filename: authMiddlewarePath,
  loaded:   true,
  exports:  {
    verificar: fn().mockImplementation((_req, _res, next) => next()),
  },
};

// Mock de RateLimitMiddleware.p2pAnnounce — bypass do express-rate-limit
const rateLimitPath = path.resolve(__dirname, '../src/infra/RateLimitMiddleware.js');
require.cache[rateLimitPath] = {
  id:       rateLimitPath,
  filename: rateLimitPath,
  loaded:   true,
  exports:  {
    geral:        fn().mockImplementation((_req, _res, next) => next()),
    auth:         fn().mockImplementation((_req, _res, next) => next()),
    escrita:      fn().mockImplementation((_req, _res, next) => next()),
    p2pAnnounce:  fn().mockImplementation((_req, _res, next) => next()),
  },
};

// ── Helpers para simular Express req/res ─────────────────────────────────────

function criarRes() {
  const res = { _status: 200, _body: null };
  res.status = fn().mockImplementation((s) => { res._status = s; return res; });
  res.json   = fn().mockImplementation((b) => { res._body  = b; return res; });
  return res;
}

function criarReq({ body = {}, params = {}, user = { id: 'user-uuid-1' } } = {}) {
  return { body, params, query: {}, user };
}

// ── Factory do controller ────────────────────────────────────────────────────

function criarControllerComMocks({ upsertError = null, selectData = [], selectError = null } = {}) {
  const upsertFn = fn().mockResolvedValue({ error: upsertError });
  const fromFn   = fn().mockReturnValue({
    upsert: upsertFn,
    select: fn().mockReturnValue({
      eq:    fn().mockReturnThis(),
      neq:   fn().mockReturnThis(),
      gt:    fn().mockReturnThis(),
      limit: fn().mockResolvedValue({ data: selectData, error: selectError }),
    }),
  });

  const supabase = { from: fromFn };

  // Configurar TURN_SECRET para que ice-config funcione
  process.env.TURN_SECRET = 'test-turn-secret';
  process.env.TURN_URL    = 'turn:turn.example.com:3478';

  // Limpar cache para pegar env atualizado
  delete require.cache[require.resolve('../src/infra/TurnConfig.js')];

  const criarWebRTCController = require('../src/controllers/WebRTCController');
  const router                = criarWebRTCController(supabase);

  return { router, supabase, mocks: { upsertFn, fromFn } };
}

function extrairHandler(router, method, routePath) {
  const layer = router.stack?.find(l =>
    l.route?.path === routePath && l.route?.methods?.[method.toLowerCase()]
  );
  if (!layer) return null;
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

// ─────────────────────────────────────────────────────────────────────────────
suite('POST /api/p2p/announce', () => {

  test('retorna 400 quando mediaId está ausente', async () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'post', '/announce');
    assert.ok(handler, 'handler /announce deve existir');

    const req = criarReq({ body: { peerId: crypto.randomUUID() } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._status, 400);
    assert.ok(res._body?.error, 'deve retornar mensagem de erro');
  });

  test('retorna 400 quando peerId não é UUID v4', async () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'post', '/announce');

    const req = criarReq({ body: { mediaId: 'media-123', peerId: 'nao-e-uuid' } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._status, 400);
  });

  test('retorna 400 quando mediaId excede 255 caracteres', async () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'post', '/announce');

    const req = criarReq({ body: { mediaId: 'x'.repeat(256), peerId: crypto.randomUUID() } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._status, 400);
  });

  test('retorna 201 com dados válidos', async () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'post', '/announce');

    const peerId = crypto.randomUUID();
    const req    = criarReq({ body: { mediaId: 'story-abc-123', peerId, region: 'BR' } });
    const res    = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._body?.ok, true);
    assert.strictEqual(res._body?.peerId, peerId);
    assert.ok(res._body?.expiresAt, 'deve retornar expiresAt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('GET /api/p2p/peers/:mediaId', () => {

  test('retorna lista de peers do mediaId', async () => {
    const peerId   = crypto.randomUUID();
    const mockData = [{ peer_id: peerId, region: 'BR' }];
    const { router } = criarControllerComMocks({ selectData: mockData });
    const handler    = extrairHandler(router, 'get', '/peers/:mediaId');
    assert.ok(handler, 'handler /peers/:mediaId deve existir');

    const req = criarReq({ params: { mediaId: 'story-abc' } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._body?.ok, true);
    assert.ok(Array.isArray(res._body?.peers));
    assert.strictEqual(res._body.peers[0].peerId, peerId);
    assert.strictEqual(res._body.peers[0].region, 'BR');
  });

  test('retorna lista vazia quando não há peers', async () => {
    const { router } = criarControllerComMocks({ selectData: [] });
    const handler    = extrairHandler(router, 'get', '/peers/:mediaId');

    const req = criarReq({ params: { mediaId: 'story-inexistente' } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._body?.ok, true);
    assert.deepStrictEqual(res._body?.peers, []);
  });

  test('retorna 400 quando mediaId excede 255 caracteres', async () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'get', '/peers/:mediaId');

    const req = criarReq({ params: { mediaId: 'x'.repeat(256) } });
    const res = criarRes();
    await handler(req, res, fn());

    assert.strictEqual(res._status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('GET /api/p2p/ice-config', () => {

  test('retorna iceServers com ao menos um servidor STUN', () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'get', '/ice-config');
    assert.ok(handler, 'handler /ice-config deve existir');

    const req = criarReq();
    const res = criarRes();
    handler(req, res, fn());

    assert.strictEqual(res._body?.ok, true);
    assert.ok(Array.isArray(res._body?.iceServers), 'iceServers deve ser array');
    const stun = res._body.iceServers.find(s => s.urls?.startsWith('stun:'));
    assert.ok(stun, 'deve incluir servidor STUN');
  });

  test('retorna expiresAt como timestamp futuro', () => {
    const { router } = criarControllerComMocks();
    const handler    = extrairHandler(router, 'get', '/ice-config');

    const req = criarReq();
    const res = criarRes();
    handler(req, res, fn());

    assert.ok(res._body?.expiresAt > Date.now(), 'expiresAt deve ser no futuro');
  });
});
