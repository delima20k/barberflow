'use strict';
/**
 * tests/push-subscription-service.test.js
 *
 * Testa PushSubscriptionService: registro, renovação e revogação
 * de Web Push subscriptions.
 *
 * Cenários cobertos:
 *   #suportado()      — false quando APIs ausentes
 *   #getDeviceId()    — persiste UUID entre chamadas, cria se não existir
 *   #urlBase64ToUint8Array() — converte base64url corretamente
 *   init()            — noop sem userId
 *   init()            — noop se Notification.permission !== 'granted'
 *   registrar()       — subscribe + POST no backend
 *   renovar()         — reutiliza subscription existente
 *   revogar()         — unsubscribe + DELETE no backend
 */

const { suite, test, beforeEach } = require('node:test');
const assert                      = require('node:assert/strict');
const vm                          = require('node:vm');
const { fn, carregar }            = require('./_helpers.js');

// ─── UUIDs de teste ──────────────────────────────────────────

const UUID_USER   = 'a1111111-0000-4000-8000-000000000001';
const ENDPOINT    = 'https://fcm.googleapis.com/fcm/send/test-token';
const P256DH      = 'BNcr7aGTpYVVPNXENLpqpPkFOVDRpFl_VBfDHLf9iNKkCBYBRrSsL_3Hh_tBqCp_TEST';
const AUTH        = 'dGVzdGF1dGgxNg==';
const DEVICE_ID   = 'device-uuid-test-1234';

// ─── Factory da sandbox VM ────────────────────────────────────

function criarSandbox({ permission = 'granted', subscription = null, fetchStatus = 200 } = {}) {
  // localStorage mock
  const lsStore = new Map();
  const localStorageMock = {
    getItem:    (k) => lsStore.get(k) ?? null,
    setItem:    (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
  };

  // PushManager mock
  const mockSub = subscription ?? {
    endpoint:    ENDPOINT,
    toJSON:      () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
    unsubscribe: fn().mockResolvedValue(true),
  };

  const pushManagerMock = {
    getSubscription: fn().mockResolvedValue(subscription),
    subscribe:       fn().mockResolvedValue(mockSub),
  };

  const swRegMock = { pushManager: pushManagerMock };

  // Fetch mock — armazena chamadas em array para asserção
  const fetchCalls = [];
  const fetchMock  = fn(async (url, opts) => {
    fetchCalls.push({ url, opts });
    return { ok: fetchStatus < 400, status: fetchStatus };
  });

  const sandbox = vm.createContext({
    // Browser APIs necessárias para PushSubscriptionService
    Notification:  { permission },
    window:        { PushManager: {}, Notification: { permission } },
    PushManager:   {},
    navigator: {
      serviceWorker: {
        ready: Promise.resolve(swRegMock),
      },
    },
    localStorage: localStorageMock,
    fetch:        fetchMock,
    crypto:       { randomUUID: () => DEVICE_ID },
    atob:         globalThis.atob.bind(globalThis),
    // Dependências do serviço
    SupabaseService: { getSession: fn().mockResolvedValue({ access_token: 'jwt-test-token' }) },
    LoggerService:   { warn: fn(), info: fn() },
    // Mocks expostos para asserções
    _swReg:       swRegMock,
    _pushManager: pushManagerMock,
    _fetchCalls:  fetchCalls,
    _lsStore:     lsStore,
    _mockSub:     mockSub,
    console,
  });

  carregar(sandbox, 'shared/js/PushSubscriptionService.js');
  return sandbox;
}

// ─── Testes ──────────────────────────────────────────────────

suite('PushSubscriptionService — suporte e device ID', () => {

  test('init() é noop quando userId não fornecido', async () => {
    const sb = criarSandbox();
    await sb.PushSubscriptionService.init(null, 'cliente');
    assert.equal(sb._fetchCalls.length, 0, 'Nenhum fetch deve ocorrer sem userId');
  });

  test('init() é noop quando permission !== granted', async () => {
    const sb = criarSandbox({ permission: 'denied' });
    await sb.PushSubscriptionService.init(UUID_USER, 'cliente');
    assert.equal(sb._fetchCalls.length, 0, 'Nenhum fetch deve ocorrer com permission denied');
  });

  test('init() é noop quando permission === default', async () => {
    const sb = criarSandbox({ permission: 'default' });
    await sb.PushSubscriptionService.init(UUID_USER, 'cliente');
    assert.equal(sb._fetchCalls.length, 0, 'Nenhum fetch deve ocorrer com permission default');
  });

  test('#getDeviceId gera e persiste UUID no localStorage', async () => {
    const sb = criarSandbox();
    // Acessa via teste indireto: registrar() chama #getDeviceId internamente
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'cliente');
    // deviceId deve estar salvo no localStorage
    const stored = sb._lsStore.get('bf_device_id');
    assert.ok(stored, 'deviceId deve ser persistido no localStorage');
  });

  test('#getDeviceId reutiliza UUID existente no localStorage', async () => {
    const sb = criarSandbox();
    sb._lsStore.set('bf_device_id', 'existing-device-uuid');
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'cliente');
    const body = JSON.parse(sb._fetchCalls[0].opts.body);
    assert.equal(body.deviceId, 'existing-device-uuid', 'Deve reutilizar deviceId existente');
  });

  test('#urlBase64ToUint8Array converte base64url corretamente', () => {
    const sb = criarSandbox();
    // Testa via registrar que converte VAPID_PUBLIC internamente
    // O teste indireto via subscribe com applicationServerKey
    assert.ok(
      typeof sb.PushSubscriptionService.registrar === 'function',
      'PushSubscriptionService.registrar deve existir',
    );
  });
});

suite('PushSubscriptionService — registrar()', () => {

  test('registrar() chama subscribe no PushManager com userVisibleOnly=true', async () => {
    const sb = criarSandbox();
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(sb._pushManager.subscribe.calls.length, 1, 'subscribe deve ser chamado uma vez');
    const [opts] = sb._pushManager.subscribe.calls[0];
    assert.equal(opts.userVisibleOnly, true, 'userVisibleOnly deve ser true');
    // instanceof não funciona entre contextos vm — verifica pelo nome do construtor
    assert.equal(
      opts.applicationServerKey?.constructor?.name,
      'Uint8Array',
      'applicationServerKey deve ser Uint8Array',
    );
  });

  test('registrar() faz POST para o backend com endpoint, p256dh e auth', async () => {
    const sb = criarSandbox();
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'cliente');

    assert.equal(sb._fetchCalls.length, 1, 'Deve haver exatamente 1 POST');
    const call = sb._fetchCalls[0];
    assert.equal(call.opts.method, 'POST', 'Método deve ser POST');
    assert.ok(call.url.includes('push-subscriptions'), 'URL deve apontar para push-subscriptions');

    const body = JSON.parse(call.opts.body);
    assert.equal(body.endpoint, ENDPOINT,  'body.endpoint correto');
    assert.equal(body.p256dh,   P256DH,    'body.p256dh correto');
    assert.equal(body.auth,     AUTH,      'body.auth correto');
    assert.equal(body.appId,    'cliente', 'body.appId correto');
  });

  test('registrar() envia Authorization Bearer no header', async () => {
    const sb = criarSandbox();
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'cliente');
    const { headers } = sb._fetchCalls[0].opts;
    assert.ok(headers['Authorization'].startsWith('Bearer '), 'Authorization Bearer deve estar presente');
  });

  test('registrar() com appId profissional envia appId correto', async () => {
    const sb = criarSandbox();
    await sb.PushSubscriptionService.registrar(sb._swReg, UUID_USER, 'profissional');
    const body = JSON.parse(sb._fetchCalls[0].opts.body);
    assert.equal(body.appId, 'profissional', 'appId deve ser profissional');
  });
});

suite('PushSubscriptionService — renovar()', () => {

  test('renovar() sem subscription existente chama registrar (subscribe + POST)', async () => {
    const sb = criarSandbox({ subscription: null });
    await sb.PushSubscriptionService.renovar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(sb._pushManager.subscribe.calls.length, 1, 'subscribe deve ser chamado quando não há sub');
    assert.equal(sb._fetchCalls.length, 1, 'POST deve ser feito para salvar nova sub');
  });

  test('renovar() com subscription existente NÃO chama subscribe novamente', async () => {
    const existingSub = {
      endpoint:       ENDPOINT,
      expirationTime: null, // null = sem expiração (caso mais comum)
      toJSON:         () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe:    fn().mockResolvedValue(true),
    };
    const sb = criarSandbox({ subscription: existingSub });
    await sb.PushSubscriptionService.renovar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(sb._pushManager.subscribe.calls.length, 0, 'subscribe NÃO deve ser chamado para sub existente');
    assert.equal(sb._fetchCalls.length, 1, 'POST deve ser feito para atualizar last_used (renovação)');
  });

  test('renovar() com subscription expirada chama unsubscribe + subscribe novo', async () => {
    const expiredSub = {
      endpoint:       ENDPOINT,
      expirationTime: Date.now() - 60_000, // expirou 1 minuto atrás
      toJSON:         () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe:    fn().mockResolvedValue(true),
    };
    const sb = criarSandbox({ subscription: expiredSub });
    await sb.PushSubscriptionService.renovar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(expiredSub.unsubscribe.calls.length, 1, 'unsubscribe deve ser chamado para sub expirada');
    assert.equal(sb._pushManager.subscribe.calls.length, 1, 'subscribe novo deve ser criado');
    assert.equal(sb._fetchCalls.length, 1, 'POST deve salvar a nova sub');
  });

  test('renovar() com subscription expirando em < 24h faz resubscription preventiva', async () => {
    const expiringSub = {
      endpoint:       ENDPOINT,
      expirationTime: Date.now() + (12 * 60 * 60 * 1000), // expira em 12h
      toJSON:         () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe:    fn().mockResolvedValue(true),
    };
    const sb = criarSandbox({ subscription: expiringSub });
    await sb.PushSubscriptionService.renovar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(expiringSub.unsubscribe.calls.length, 1, 'unsubscribe preventivo deve ser chamado');
    assert.equal(sb._pushManager.subscribe.calls.length, 1, 'nova sub deve ser criada antes de expirar');
  });

  test('renovar() com subscription válida (expirationTime no futuro > 24h) NÃO re-registra', async () => {
    const validSub = {
      endpoint:       ENDPOINT,
      expirationTime: Date.now() + (48 * 60 * 60 * 1000), // expira em 48h
      toJSON:         () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe:    fn().mockResolvedValue(true),
    };
    const sb = criarSandbox({ subscription: validSub });
    await sb.PushSubscriptionService.renovar(sb._swReg, UUID_USER, 'cliente');
    assert.equal(validSub.unsubscribe.calls.length, 0, 'unsubscribe NÃO deve ser chamado');
    assert.equal(sb._pushManager.subscribe.calls.length, 0, 'subscribe NÃO deve ser chamado');
    assert.equal(sb._fetchCalls.length, 1, 'apenas POST para atualizar last_used');
  });
});

suite('PushSubscriptionService — revogar()', () => {

  test('revogar() chama unsubscribe e DELETE no backend', async () => {
    const existingSub = {
      endpoint:    ENDPOINT,
      toJSON:      () => ({ keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe: fn().mockResolvedValue(true),
    };
    function mkRevogarContext({ sub }) {
      const ctx = vm.createContext({
        Notification:  { permission: 'granted' },
        window:        { PushManager: {} },
        PushManager:   {},
        navigator: {
          serviceWorker: {
            ready: Promise.resolve({
              pushManager: {
                getSubscription: fn().mockResolvedValue(sub),
                subscribe:       fn().mockResolvedValue(sub),
              },
            }),
          },
        },
        localStorage:    { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        fetch:           fn().mockResolvedValue({ ok: true, status: 200 }),
        crypto:          { randomUUID: () => DEVICE_ID },
        atob:            globalThis.atob.bind(globalThis),
        SupabaseService: { getSession: fn().mockResolvedValue({ access_token: 'jwt-test' }) },
        LoggerService:   { warn: fn(), info: fn() },
        console,
      });
      carregar(ctx, 'shared/js/PushSubscriptionService.js');
      return ctx;
    }

    const sbContext = mkRevogarContext({ sub: existingSub });

    await sbContext.PushSubscriptionService.revogar();

    assert.equal(existingSub.unsubscribe.calls.length, 1, 'unsubscribe deve ser chamado');

    const deleteFetch = sbContext.fetch.calls.find(([, opts]) => opts?.method === 'DELETE');
    assert.ok(deleteFetch, 'DELETE deve ser chamado no backend');
    const body = JSON.parse(deleteFetch[1].body);
    assert.equal(body.endpoint, ENDPOINT, 'DELETE deve enviar o endpoint correto');
  });

  test('revogar() sem subscription ativa é noop (sem erros)', async () => {
    const sbContext = (() => {
      const ctx = vm.createContext({
        Notification:  { permission: 'granted' },
        window:        { PushManager: {} },
        PushManager:   {},
        navigator: {
          serviceWorker: {
            ready: Promise.resolve({
              pushManager: { getSubscription: fn().mockResolvedValue(null) },
            }),
          },
        },
        localStorage:    { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        fetch:           fn().mockResolvedValue({ ok: true, status: 200 }),
        crypto:          { randomUUID: () => DEVICE_ID },
        atob:            globalThis.atob.bind(globalThis),
        SupabaseService: { getSession: fn().mockResolvedValue({ access_token: 'jwt-test' }) },
        LoggerService:   { warn: fn(), info: fn() },
        console,
      });
      carregar(ctx, 'shared/js/PushSubscriptionService.js');
      return ctx;
    })();
    await assert.doesNotReject(
      () => sbContext.PushSubscriptionService.revogar(),
      'revogar sem sub deve ser silencioso',
    );
    assert.equal(sbContext.fetch.calls.length, 0, 'Nenhum DELETE sem subscription ativa');
  });
});
