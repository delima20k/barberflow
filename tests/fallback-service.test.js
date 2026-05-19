'use strict';

// =============================================================
// fallback-service.test.js — TDD para FallbackService e MemoryCacheProvider.
// Framework: node:test + node:assert/strict (nativo)
//
// Cenários cobertos:
//
//   download() — requisitos obrigatórios:
//     1.  P2P sucesso → retorna Buffer do P2P; cache e R2 nunca chamados
//     2.  P2P falha → cache usado; R2 não chamado
//     3.  Cache miss → R2 usado
//     4.  Todos falham → Error{status:502} com detalhes de cada source
//     5.  fileId não-UUID → Error{status:400}
//     6.  fileId null     → Error{status:400}
//
//   Retry (3× por fonte):
//     7.  P2P falha exatamente 3× antes de avançar para cache
//     8.  P2P falha 2×, sucede na 3ª → Buffer do P2P; nenhum fallback
//     9.  Cache falha 3× → R2 chamado
//    10.  Todos falham → cada fonte tentada exatamente 3×
//    11.  maxRetries customizado (5) → P2P tentado 5×
//
//   Ordem de prioridade (NUNCA violada):
//    12.  P2P disponível → NUNCA usa cache ou R2
//    13.  P2P falha + cache disponível → NUNCA usa R2
//    14.  P2P falha + cache miss → R2 é último recurso
//    15.  Cache miss não pula R2 — ordem preservada
//    16.  Cache miss não usa retry — avança imediatamente (1 chamada)
//
//   MemoryCacheProvider:
//    17.  get → null para chave ausente
//    18.  set + get → retorna Buffer armazenado
//    19.  has → false/true antes/depois de set
//    20.  delete → remove entrada; get retorna null; has retorna false
//    21.  size → contagem correta em cada operação
//    22.  clear → esvazia o cache
//    23.  funciona como cacheProvider no FallbackService (integração)
//
//   Construtor:
//    24.  p2pProvider ausente → TypeError
//    25.  cacheProvider ausente → TypeError
//    26.  r2Provider ausente → TypeError
//    27.  maxRetries = 0 → RangeError
//    28.  maxRetries negativo → RangeError
//    29.  getter maxRetries retorna valor configurado
//    30.  getter maxRetries retorna 3 por padrão
// =============================================================

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { fn }           = require('./_helpers.js');

const { FallbackService, MemoryCacheProvider } =
  require('../src/services/FallbackService');

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────
const UUID_FILE    = '00000000-0000-4000-8000-000000000001';
const BUFFER_P2P   = Buffer.from('dado-p2p');
const BUFFER_CACHE = Buffer.from('dado-cache');
const BUFFER_R2    = Buffer.from('dado-r2');

// ─────────────────────────────────────────────────────────────
// Factories de mocks
//
// okProvider(buf)         → sempre retorna buf (Buffer)
// missProvider()          → sempre retorna null (cache miss)
// failProvider(msg?)      → sempre lança Error (erro transiente)
// ─────────────────────────────────────────────────────────────
const okProvider   = (buf) => ({ get: fn().mockResolvedValue(buf) });
const missProvider = ()    => ({ get: fn().mockResolvedValue(null) });
const failProvider = (msg = 'source unavailable') =>
  ({ get: fn().mockRejectedValue(new Error(msg)) });

/**
 * Constrói um FallbackService com defaults seguros.
 * Ideal para testes que não precisam verificar chamadas individuais.
 */
function build({ p2p, cache, r2, maxRetries } = {}) {
  return new FallbackService({
    p2pProvider:   p2p   ?? okProvider(BUFFER_P2P),
    cacheProvider: cache ?? missProvider(),
    r2Provider:    r2    ?? okProvider(BUFFER_R2),
    ...(maxRetries !== undefined && { maxRetries }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Requisitos obrigatórios
// ─────────────────────────────────────────────────────────────────────────────
describe('FallbackService.download() — requisitos obrigatórios', () => {

  it('P2P sucesso → retorna Buffer do P2P; cache e R2 nunca chamados', async () => {
    const p2p   = okProvider(BUFFER_P2P);
    const cache = missProvider();
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_P2P, 'deve retornar o Buffer do P2P');
    assert.equal(p2p.get.calls.length,   1, 'P2P deve ser chamado exatamente 1×');
    assert.equal(cache.get.calls.length, 0, 'cache NÃO deve ser chamado');
    assert.equal(r2.get.calls.length,    0, 'R2 NÃO deve ser chamado');
  });

  it('P2P falha → cache usado; R2 não chamado', async () => {
    const p2p   = failProvider('P2P down');
    const cache = okProvider(BUFFER_CACHE);
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_CACHE, 'deve retornar o Buffer do cache');
    assert.equal(p2p.get.calls.length,   3, 'P2P deve ser tentado 3× (maxRetries) antes do fallback');
    assert.equal(cache.get.calls.length, 1, 'cache deve ser chamado 1×');
    assert.equal(r2.get.calls.length,    0, 'R2 NÃO deve ser chamado');
  });

  it('Cache miss → R2 usado', async () => {
    const p2p   = failProvider('P2P down');
    const cache = missProvider();
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_R2, 'deve retornar o Buffer do R2');
    assert.equal(p2p.get.calls.length,   3, 'P2P deve ser tentado 3×');
    assert.equal(cache.get.calls.length, 1, 'cache deve ser chamado 1× (miss imediato — sem retry)');
    assert.equal(r2.get.calls.length,    1, 'R2 deve ser chamado 1×');
  });

  it('Todos falham → Error{status:502} com detalhes dos sources', async () => {
    const p2p   = failProvider('P2P offline');
    const cache = failProvider('Cache corrompido');
    const r2    = failProvider('R2 timeout');
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    await assert.rejects(
      () => svc.download(UUID_FILE),
      (err) => {
        assert.equal(err.status, 502, 'status deve ser 502 — Bad Gateway');
        assert.ok(/P2P offline/i.test(err.message),      'mensagem deve incluir erro do P2P');
        assert.ok(/Cache corrompido/i.test(err.message), 'mensagem deve incluir erro do cache');
        assert.ok(/R2 timeout/i.test(err.message),       'mensagem deve incluir erro do R2');
        return true;
      },
    );
  });

  it('fileId não-UUID → Error{status:400}', async () => {
    const svc = build();
    await assert.rejects(() => svc.download('nao-e-uuid'), { status: 400 });
  });

  it('fileId null → Error{status:400}', async () => {
    const svc = build();
    await assert.rejects(() => svc.download(null), { status: 400 });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Retry (3× por fonte)
// ─────────────────────────────────────────────────────────────────────────────
describe('FallbackService — retry (3× por fonte)', () => {

  it('P2P falha exatamente 3× antes de avançar para cache', async () => {
    const p2p   = failProvider();
    const cache = okProvider(BUFFER_CACHE);
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    await svc.download(UUID_FILE);

    assert.equal(p2p.get.calls.length, 3, 'P2P deve ser tentado exatamente 3×');
  });

  it('P2P falha 2×, sucede na 3ª tentativa → retorna Buffer do P2P; nenhum fallback', async () => {
    let tentativas = 0;
    const p2p = {
      get: fn().mockImplementation(async () => {
        tentativas++;
        if (tentativas < 3) throw new Error('P2P transient');
        return BUFFER_P2P;
      }),
    };
    const cache = missProvider();
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_P2P, 'deve retornar Buffer do P2P na 3ª tentativa');
    assert.equal(p2p.get.calls.length,   3, 'P2P deve ter sido chamado 3×');
    assert.equal(cache.get.calls.length, 0, 'cache NÃO deve ser chamado (P2P recuperou)');
    assert.equal(r2.get.calls.length,    0, 'R2 NÃO deve ser chamado');
  });

  it('Cache falha 3× → R2 chamado após todos os retries do cache', async () => {
    const p2p   = failProvider();
    const cache = failProvider('cache error');
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_R2, 'deve retornar Buffer do R2');
    assert.equal(cache.get.calls.length, 3, 'cache deve ser tentado 3× antes do R2');
    assert.equal(r2.get.calls.length,    1, 'R2 deve ser chamado 1×');
  });

  it('Todos falham → cada fonte tentada exatamente 3×', async () => {
    const p2p   = failProvider();
    const cache = failProvider();
    const r2    = failProvider();
    const svc   = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });

    await assert.rejects(() => svc.download(UUID_FILE));

    assert.equal(p2p.get.calls.length,   3, 'P2P deve ter exatamente 3 tentativas');
    assert.equal(cache.get.calls.length, 3, 'cache deve ter exatamente 3 tentativas');
    assert.equal(r2.get.calls.length,    3, 'R2 deve ter exatamente 3 tentativas');
  });

  it('maxRetries customizado (5) → P2P tentado 5× antes do cache', async () => {
    const p2p   = failProvider();
    const cache = okProvider(BUFFER_CACHE);
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({
      p2pProvider:   p2p,
      cacheProvider: cache,
      r2Provider:    r2,
      maxRetries:    5,
    });

    await svc.download(UUID_FILE);

    assert.equal(p2p.get.calls.length, 5, 'P2P deve ser tentado 5× com maxRetries=5');
  });

  it('cache miss não usa retries — avança imediatamente para R2 (1 chamada ao cache)', async () => {
    const p2p   = failProvider();
    const cache = missProvider();
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({
      p2pProvider:   p2p,
      cacheProvider: cache,
      r2Provider:    r2,
      maxRetries:    5, // alto para evidenciar que cache só é chamado 1×
    });

    await svc.download(UUID_FILE);

    assert.equal(cache.get.calls.length, 1,
      'cache miss (null) deve ser tratado sem retry — apenas 1 chamada');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Ordem de prioridade (P2P > Cache > R2)
// ─────────────────────────────────────────────────────────────────────────────
describe('FallbackService — ordem de prioridade (P2P > Cache > R2)', () => {

  it('P2P disponível → NUNCA usa cache ou R2', async () => {
    const cache = okProvider(BUFFER_CACHE);
    const r2    = okProvider(BUFFER_R2);
    const svc   = new FallbackService({
      p2pProvider:   okProvider(BUFFER_P2P),
      cacheProvider: cache,
      r2Provider:    r2,
    });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_P2P);
    assert.equal(cache.get.calls.length, 0, 'cache não deve ser usado quando P2P funciona');
    assert.equal(r2.get.calls.length,    0, 'R2 não deve ser usado quando P2P funciona');
  });

  it('P2P falha + cache disponível → NUNCA usa R2', async () => {
    const r2  = okProvider(BUFFER_R2);
    const svc = new FallbackService({
      p2pProvider:   failProvider(),
      cacheProvider: okProvider(BUFFER_CACHE),
      r2Provider:    r2,
    });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_CACHE);
    assert.equal(r2.get.calls.length, 0, 'R2 não deve ser usado quando cache tem o arquivo');
  });

  it('P2P falha + cache miss → R2 é o último recurso', async () => {
    const svc = new FallbackService({
      p2pProvider:   failProvider(),
      cacheProvider: missProvider(),
      r2Provider:    okProvider(BUFFER_R2),
    });

    const result = await svc.download(UUID_FILE);

    assert.deepEqual(result, BUFFER_R2, 'R2 deve salvar quando P2P e cache não têm o arquivo');
  });

  it('cache miss não pula R2 — R2 ainda é chamado após miss', async () => {
    const r2  = okProvider(BUFFER_R2);
    const svc = new FallbackService({
      p2pProvider:   failProvider(),
      cacheProvider: missProvider(),
      r2Provider:    r2,
    });

    await svc.download(UUID_FILE);

    assert.equal(r2.get.calls.length, 1, 'R2 deve ser chamado após cache miss');
  });

  it('R2 retorna a ordem correta: P2P → cache → R2', async () => {
    // Verifica pelo conteúdo do buffer retornado em cada cenário
    const cenarios = [
      {
        desc:   'P2P ok',
        p2p:    okProvider(BUFFER_P2P),
        cache:  okProvider(BUFFER_CACHE),
        r2:     okProvider(BUFFER_R2),
        expect: BUFFER_P2P,
      },
      {
        desc:   'P2P fail, cache ok',
        p2p:    failProvider(),
        cache:  okProvider(BUFFER_CACHE),
        r2:     okProvider(BUFFER_R2),
        expect: BUFFER_CACHE,
      },
      {
        desc:   'P2P fail, cache miss, R2 ok',
        p2p:    failProvider(),
        cache:  missProvider(),
        r2:     okProvider(BUFFER_R2),
        expect: BUFFER_R2,
      },
    ];

    for (const { desc, p2p, cache, r2, expect: esperado } of cenarios) {
      const svc = new FallbackService({ p2pProvider: p2p, cacheProvider: cache, r2Provider: r2 });
      const result = await svc.download(UUID_FILE);
      assert.deepEqual(result, esperado, `[${desc}] buffer incorreto`);
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — MemoryCacheProvider
// ─────────────────────────────────────────────────────────────────────────────
describe('MemoryCacheProvider', () => {

  it('get retorna null para chave ausente (nunca lança)', async () => {
    const cache = new MemoryCacheProvider();
    assert.equal(await cache.get(UUID_FILE), null);
  });

  it('set + get retorna o Buffer armazenado', async () => {
    const cache = new MemoryCacheProvider();
    const buf   = Buffer.from('arquivo-cacheado');
    cache.set(UUID_FILE, buf);
    assert.deepEqual(await cache.get(UUID_FILE), buf);
  });

  it('has retorna false para chave ausente', () => {
    const cache = new MemoryCacheProvider();
    assert.equal(cache.has(UUID_FILE), false);
  });

  it('has retorna true após set', () => {
    const cache = new MemoryCacheProvider();
    cache.set(UUID_FILE, Buffer.alloc(1));
    assert.equal(cache.has(UUID_FILE), true);
  });

  it('delete remove a entrada; get volta a retornar null', async () => {
    const cache = new MemoryCacheProvider();
    cache.set(UUID_FILE, Buffer.alloc(1));
    cache.delete(UUID_FILE);
    assert.equal(await cache.get(UUID_FILE), null);
    assert.equal(cache.has(UUID_FILE), false);
  });

  it('size reflete adições e remoções', () => {
    const cache = new MemoryCacheProvider();
    assert.equal(cache.size, 0);
    cache.set('id-1', Buffer.alloc(1));
    assert.equal(cache.size, 1);
    cache.set('id-2', Buffer.alloc(1));
    assert.equal(cache.size, 2);
    cache.delete('id-1');
    assert.equal(cache.size, 1);
  });

  it('clear esvazia completamente o cache', () => {
    const cache = new MemoryCacheProvider();
    cache.set('id-1', Buffer.alloc(1));
    cache.set('id-2', Buffer.alloc(1));
    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(cache.has('id-1'), false);
    assert.equal(cache.has('id-2'), false);
  });

  it('set é encadeável (retorna this)', () => {
    const cache = new MemoryCacheProvider();
    const ret = cache.set('a', Buffer.alloc(1));
    assert.equal(ret, cache);
  });

  it('funciona como cacheProvider no FallbackService (integração real)', async () => {
    const cache = new MemoryCacheProvider();
    cache.set(UUID_FILE, BUFFER_CACHE);

    const svc = new FallbackService({
      p2pProvider:   failProvider(),   // P2P falha → vai para cache
      cacheProvider: cache,
      r2Provider:    failProvider(),   // R2 não deve ser chamado
    });

    const result = await svc.download(UUID_FILE);
    assert.deepEqual(result, BUFFER_CACHE, 'MemoryCacheProvider deve servir o arquivo');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Construtor FallbackService
// ─────────────────────────────────────────────────────────────────────────────
describe('FallbackService — construtor', () => {

  it('p2pProvider ausente → TypeError', () => {
    assert.throws(
      () => new FallbackService({
        cacheProvider: missProvider(),
        r2Provider:    okProvider(BUFFER_R2),
      }),
      TypeError,
    );
  });

  it('cacheProvider ausente → TypeError', () => {
    assert.throws(
      () => new FallbackService({
        p2pProvider: okProvider(BUFFER_P2P),
        r2Provider:  okProvider(BUFFER_R2),
      }),
      TypeError,
    );
  });

  it('r2Provider ausente → TypeError', () => {
    assert.throws(
      () => new FallbackService({
        p2pProvider:   okProvider(BUFFER_P2P),
        cacheProvider: missProvider(),
      }),
      TypeError,
    );
  });

  it('maxRetries = 0 → RangeError', () => {
    assert.throws(() => build({ maxRetries: 0 }), RangeError);
  });

  it('maxRetries negativo → RangeError', () => {
    assert.throws(() => build({ maxRetries: -1 }), RangeError);
  });

  it('maxRetries não-inteiro → RangeError', () => {
    assert.throws(() => build({ maxRetries: 1.5 }), RangeError);
  });

  it('getter maxRetries retorna valor configurado', () => {
    const svc = build({ maxRetries: 5 });
    assert.equal(svc.maxRetries, 5);
  });

  it('getter maxRetries retorna 3 por padrão', () => {
    const svc = build();
    assert.equal(svc.maxRetries, 3);
  });

});
