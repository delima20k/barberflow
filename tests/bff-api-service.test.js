'use strict';
/**
 * tests/bff-api-service.test.js
 *
 * Testa BffApiService:
 *   - temTokenValido(): leitura de token no localStorage com validação de expiração
 *   - patch(): expõe error.status HTTP para que chamadores possam distinguir 401 de 5xx
 *   - authHeaders: Bearer enviado quando token válido, ausente quando não há token
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

/**
 * Monta sandbox com localStorage injetado e fetch mockado.
 * @param {Record<string,string>} lsStore  — chaves iniciais do localStorage
 * @param {Function}              fetchImpl — mock de fetch (opcional)
 * @param {Object|null}           session — sessão Supabase mockada (opcional)
 */
function criarSandbox(lsStore = {}, fetchImpl, session = null) {
  const lsMap = new Map(Object.entries(lsStore));
  const sb = vm.createContext({
    console,
    Error,
    TypeError,
    Promise,
    window: { location: { hostname: 'localhost' } },
    localStorage: {
      getItem:    fn((k) => lsMap.get(k) ?? null),
      setItem:    fn((k, v) => lsMap.set(k, String(v))),
      removeItem: fn((k) => lsMap.delete(k)),
    },
    AbortController: class {
      constructor() { this.signal = {}; }
      abort() {}
    },
    setTimeout:   fn((cb) => { try { cb(); } catch {} }),
    clearTimeout: fn(),
    fetch: fetchImpl ?? fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    SupabaseService: {
      getSession: fn().mockResolvedValue(session),
    },
  });
  carregar(sb, 'shared/js/BffApiService.js');
  return sb;
}

/** Gera JSON de sessão válida com access_token e expires_at configuráveis. */
function sessao(expiresAt, token = 'tok-abc-123') {
  return JSON.stringify({
    access_token: token,
    token_type:   'bearer',
    expires_in:   3600,
    expires_at:   expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'rt-abc',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.temTokenValido()
// ─────────────────────────────────────────────────────────────────────────────
describe('BffApiService.temTokenValido()', () => {

  test('retorna false quando localStorage não tem sessão', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando sessão não tem access_token', () => {
    const ls = { [STORAGE_KEY]: JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) + 3600 }) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando sessão não tem expires_at', () => {
    const ls = { [STORAGE_KEY]: JSON.stringify({ access_token: 'tok' }) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando token está expirado', () => {
    const expirado = Math.floor(Date.now() / 1000) - 100;
    const ls = { [STORAGE_KEY]: sessao(expirado) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando token expira em menos de 60s (buffer de segurança)', () => {
    const quaseExpirado = Math.floor(Date.now() / 1000) + 30;
    const ls = { [STORAGE_KEY]: sessao(quaseExpirado) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna true quando token tem mais de 60s de validade', () => {
    const ls = { [STORAGE_KEY]: sessao() }; // +1h
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), true);
  });

  test('retorna false quando JSON do localStorage é inválido', () => {
    const ls = { [STORAGE_KEY]: 'json-invalido-{{{' };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.patch() — header Authorization e status no erro
// ─────────────────────────────────────────────────────────────────────────────
describe('BffApiService.patch()', () => {

  test('inclui header Authorization Bearer quando token válido', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    await sb.BffApiService.patch('/api/v1/clientes/localizacao', { lat: 0, lng: 0 });

    assert.ok(capturedOpts.length > 0, 'fetch deve ter sido chamado');
    assert.ok(
      String(capturedOpts[0].headers?.['Authorization'] ?? '').startsWith('Bearer '),
      'header Authorization deve começar com "Bearer "'
    );
  });

  test('não inclui header Authorization quando token ausente', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock);

    await sb.BffApiService.patch('/api/v1/test', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      undefined,
      'header Authorization não deve estar presente sem token'
    );
  });

  test('retorna error.status=401 quando BFF responde 401', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'Token inválido.' }),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/clientes/localizacao', { lat: 0, lng: 0 });

    assert.ok(error instanceof Error, 'deve retornar Error');
    assert.strictEqual(error.status, 401, 'error.status deve ser 401');
  });

  test('retorna error.status=503 quando BFF retorna 503', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 503,
      json: async () => ({}),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/test', {});

    assert.strictEqual(error.status, 503);
  });

  test('retorna error sem lançar exceção quando fetch falha', async () => {
    const fetchMock = fn(async () => { throw new Error('network error'); });
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/test', {});
    assert.ok(error instanceof Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.post() — status no erro (simetria com patch)
// ─────────────────────────────────────────────────────────────────────────────
describe('BffApiService.post()', () => {

  test('inclui Bearer vindo de SupabaseService.getSession() antes do fallback localStorage', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock, { access_token: 'tok-supabase-session' });

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      'Bearer tok-supabase-session',
    );
  });

  test('mantém fallback para localStorage quando SupabaseService não tem sessão', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const ls = { [STORAGE_KEY]: sessao(undefined, 'tok-localstorage') };
    const sb = criarSandbox(ls, fetchMock, null);

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      'Bearer tok-localstorage',
    );
  });

  test('não inclui Authorization sem sessão Supabase nem token local válido', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(capturedOpts[0]?.headers?.['Authorization'], undefined);
  });

  test('retorna error.status=401 quando BFF responde 401', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'Não autorizado.' }),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.post('/api/v1/test', {});

    assert.strictEqual(error.status, 401);
  });
});

describe('BffApiService.mensalistas', () => {

  test('adicionar envia monthly_fee no payload', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 201, json: async () => ({ dados: {} }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.mensalistas.adicionar('shop-1', 'client-1', 149.9);

    const payload = JSON.parse(capturedOpts[0].body);
    assert.deepStrictEqual(payload, {
      barbershop_id: 'shop-1',
      client_id:     'client-1',
      monthly_fee:   149.9,
    });
  });
});

describe('BffApiService.barbearias portfolio', () => {
  test('portfolio chama endpoint BFF agregado da barbearia', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { items: [] } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.barbearias.portfolio('shop-1', { limit: 30, offset: 0 });

    assert.ok(chamadas[0].url.includes('/api/v1/barbearias/shop-1/portfolio?'));
    assert.ok(chamadas[0].url.includes('limit=30'));
    assert.ok(chamadas[0].url.includes('offset=0'));
    assert.strictEqual(chamadas[0].opts.method, undefined);
  });
});

describe('BffApiService.musicas', () => {
  test('catalogo publico nao envia Authorization mesmo com sessao local invalida', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return {
        ok: true,
        status: 200,
        json: async () => ({ dados: { tracks: [], genres: ['Todos'] } }),
      };
    });
    const sb = criarSandbox({}, fetchMock, { access_token: 'tok-sessao-quebrada' });

    const { error } = await sb.BffApiService.musicas.catalogo({ page: 1, pageSize: 20 });

    assert.equal(error, null);
    assert.ok(chamadas[0].url.includes('/api/v1/media/stories/audio/catalog?'));
    assert.equal(chamadas[0].opts.headers?.Authorization, undefined);
  });
});

describe('BffApiService.profissionais portfolio', () => {

  test('curtirPortfolioImagem chama endpoint BFF canonico', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { liked: true, likesCount: 1 } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.profissionais.curtirPortfolioImagem('img-1');

    assert.ok(chamadas[0].url.endsWith('/api/v1/profissionais/me/portfolio/img-1/like'));
    assert.strictEqual(chamadas[0].opts.method, 'POST');
  });

  test('descurtirPortfolioImagem chama endpoint BFF canonico', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { liked: false, likesCount: 0 } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.profissionais.descurtirPortfolioImagem('img-1');

    assert.ok(chamadas[0].url.endsWith('/api/v1/profissionais/me/portfolio/img-1/like'));
    assert.strictEqual(chamadas[0].opts.method, 'DELETE');
  });

  test('listarCurtidasPortfolio envia ids por query string', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { likedIds: ['img-1'] } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.profissionais.listarCurtidasPortfolio(['img-1', 'img-2']);

    assert.ok(chamadas[0].url.includes('/api/v1/profissionais/me/portfolio/likes?'));
    assert.ok(chamadas[0].url.includes('ids=img-1%2Cimg-2'));
    assert.strictEqual(chamadas[0].opts.method, undefined);
  });
});

describe('BffApiService.media stories', () => {
  test('listarStoryMessages chama endpoint canonico com limit', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { messages: [] } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.media.listarStoryMessages('media-1', { limit: 50 });

    assert.ok(chamadas[0].url.includes('/api/v1/media/media-1/messages?'));
    assert.ok(chamadas[0].url.includes('limit=50'));
    assert.strictEqual(chamadas[0].opts.method, undefined);
  });

  test('enviarStoryMessage envia payload pelo BFF', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 201, json: async () => ({ dados: { message: { body: 'Top' } } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.media.enviarStoryMessage('media-1', {
      body: 'Top',
      clientMessageId: 'client-1',
    });

    assert.ok(chamadas[0].url.endsWith('/api/v1/media/media-1/messages'));
    assert.strictEqual(chamadas[0].opts.method, 'POST');
    assert.deepStrictEqual(JSON.parse(chamadas[0].opts.body), {
      body: 'Top',
      clientMessageId: 'client-1',
    });
  });
});

describe('BffApiService.chat', () => {
  test('listarMensagens chama endpoint canonico de mensagens da conversa', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ dados: { items: [] } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.chat.listarMensagens('conv-1', { limit: 30 });

    assert.ok(chamadas[0].url.includes('/api/v1/chat/conversations/conv-1/messages?'));
    assert.ok(chamadas[0].url.includes('limit=30'));
    assert.strictEqual(chamadas[0].opts.method, undefined);
  });
});

describe('BffApiService.profissionais mensagem barbearia', () => {
  test('iniciarMensagemBarbearia envia payload opcional para mensagem de portfolio', async () => {
    const chamadas = [];
    const fetchMock = fn(async (url, opts) => {
      chamadas.push({ url, opts });
      return { ok: true, status: 201, json: async () => ({ dados: { conversationId: 'conv-1' } }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.profissionais.iniciarMensagemBarbearia('pro-1', {
      body: 'Ficou top',
      portfolioImageId: 'img-1',
      clientMessageId: 'msg-1',
    });

    assert.ok(chamadas[0].url.endsWith('/api/v1/profissionais/pro-1/mensagem-barbearia'));
    assert.deepStrictEqual(JSON.parse(chamadas[0].opts.body), {
      body: 'Ficou top',
      portfolioImageId: 'img-1',
      clientMessageId: 'msg-1',
    });
  });
});

describe('BffApiService.uploadBinario otimizado', () => {
  test('salvarImagem respeita skipCompression para payload ja otimizado', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({ dados: {} }) };
    });
    const sb = criarSandbox({}, fetchMock, null);
    sb.ImageCompressionService = {
      compress: fn(async () => {
        throw new Error('nao deve recomprimir');
      }),
    };
    const buffer = new ArrayBuffer(8);

    const { error } = await sb.BffApiService.barbearias.salvarImagem('logo', buffer, 'image/webp', {
      skipCompression: true,
    });

    assert.equal(error, null);
    assert.equal(capturedOpts[0].body, buffer);
    assert.equal(capturedOpts[0].headers['Content-Type'], 'image/webp');
    assert.equal(sb.ImageCompressionService.compress.calls.length, 0);
  });
});
