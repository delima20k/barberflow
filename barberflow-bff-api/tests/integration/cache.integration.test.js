'use strict';

/**
 * Testes de integração do pipeline de cache.
 *
 * Substituto de Redis: MemoryCache — mesma interface (ICache), comportamento
 * idêntico para fins de integração. Para testes com Redis real, substituir
 * MemoryCache por RedisCache com um cliente ioredis apontando para Redis em
 * container (ex.: `new Redis('redis://localhost:6379')`).
 *
 * O que é testado aqui:
 *   - Pipeline completo: Strategy → SingleFlightCache → MemoryCache (mock Redis)
 *   - CachedUseCaseDecorator integrado com CacheAsideStrategy
 *   - CacheInvalidationSubscriber reagindo a eventos via DomainEventPublisher
 *   - IdempotencyMiddleware end-to-end (cache + resposta)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { MemoryCache }             = require('../../infrastructure/cache/MemoryCache');
const { CacheMetrics }            = require('../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }       = require('../../infrastructure/cache/SingleFlightCache');
const { CacheKeyBuilder }         = require('../../infrastructure/cache/CacheKeyBuilder');
const { CacheAsideStrategy }      = require('../../infrastructure/cache/strategies/CacheAsideStrategy');
const { WriteThroughStrategy }    = require('../../infrastructure/cache/strategies/WriteThroughStrategy');
const { DomainEventPublisher }    = require('../../infrastructure/events/DomainEventPublisher');
const { CacheInvalidationSubscriber } = require('../../infrastructure/events/CacheInvalidationSubscriber');
const { CachedUseCaseDecorator }  = require('../../application/shared/CachedUseCaseDecorator');
const { IdempotencyMiddleware }   = require('../../interfaces/bff/middlewares/IdempotencyMiddleware');
const { Result }                  = require('../../domain/shared/Result');
const { CACHE_TTL }               = require('../../config/cacheTtl');

function buildPipeline() {
  const rawCache = new MemoryCache();
  const metrics  = new CacheMetrics();
  const sfc      = new SingleFlightCache({ cache: rawCache, metrics });
  return { rawCache, metrics, sfc };
}

afterEach(() => DomainEventPublisher._reset());

// ── 1. Pipeline CacheAside end-to-end ─────────────────────────
describe('[Integration] CacheAsideStrategy pipeline', () => {
  it('miss → fetch → store → hit no próximo read', async () => {
    const { sfc, metrics } = buildPipeline();
    const strategy = new CacheAsideStrategy({ cache: sfc, metrics });
    const key = CacheKeyBuilder.build('barbearia', 'profile', 'barber-1');

    let dbCalls = 0;
    const fetchFromDb = () => { dbCalls++; return Promise.resolve({ id: 'barber-1', nome: 'Bob' }); };

    const first  = await strategy.read(key, fetchFromDb, CACHE_TTL.BARBEARIA_PROFILE);
    const second = await strategy.read(key, fetchFromDb, CACHE_TTL.BARBEARIA_PROFILE);

    assert.deepEqual(first, { id: 'barber-1', nome: 'Bob' });
    assert.deepEqual(second, { id: 'barber-1', nome: 'Bob' });
    assert.equal(dbCalls, 1, 'banco deve ser consultado apenas 1 vez');

    const snap = metrics.getSnapshot();
    assert.equal(snap.hits, 1);
    assert.equal(snap.misses, 1);
    assert.equal(snap.hitRatio, 0.5);
  });
});

// ── 2. WriteThrough pipeline ───────────────────────────────────
describe('[Integration] WriteThroughStrategy pipeline', () => {
  it('escrita em cache e persistFn são executadas juntas', async () => {
    const { sfc, metrics } = buildPipeline();
    const strategy = new WriteThroughStrategy({ cache: sfc, metrics });
    const key = CacheKeyBuilder.build('agendamento', 'agendamento', 'ag-1');

    const dbRows = {};
    const persistFn = async v => { dbRows[v.id] = v; };

    await strategy.write(key, { id: 'ag-1', status: 'confirmed' }, persistFn, CACHE_TTL.AGENDAMENTO_SINGLE);

    assert.deepEqual(dbRows['ag-1'], { id: 'ag-1', status: 'confirmed' });
    const fromCache = await sfc.get(key);
    assert.deepEqual(fromCache, { id: 'ag-1', status: 'confirmed' });
  });
});

// ── 3. CachedUseCaseDecorator + CacheAside ─────────────────────
describe('[Integration] CachedUseCaseDecorator', () => {
  it('decorator cobre exatamente o TTL configurado', async () => {
    const { sfc, metrics } = buildPipeline();
    let calls = 0;
    const fakeUc = { execute: async cmd => { calls++; return Result.ok({ id: cmd.id }); } };

    const dec = new CachedUseCaseDecorator({
      useCase:      fakeUc,
      cacheService: sfc,
      keyFn:        cmd => CacheKeyBuilder.build('agendamento', 'agendamento', cmd.id),
      ttlSeconds:   0.1, // 100ms — deve expirar
    });

    await dec.execute({ id: 'x' });
    await dec.execute({ id: 'x' }); // hit
    assert.equal(calls, 1);

    // Esperar TTL expirar
    await new Promise(r => setTimeout(r, 150));
    await dec.execute({ id: 'x' }); // miss novamente
    assert.equal(calls, 2);

    const snap = metrics.getSnapshot();
    assert.equal(snap.hits, 1);
    assert.equal(snap.misses, 2);
  });
});

// ── 4. CacheInvalidationSubscriber reage a eventos ─────────────
describe('[Integration] CacheInvalidationSubscriber', () => {
  it('AgendamentoCriado invalida listas do cliente e profissional', async () => {
    const { sfc } = buildPipeline();
    const publisher = DomainEventPublisher.getInstance();
    const subscriber = new CacheInvalidationSubscriber({ cache: sfc });
    subscriber.register(publisher);

    // Popular listas no cache
    const clienteListKey      = CacheKeyBuilder.buildList('agendamento', 'agendamento', { clienteId: 'c1' });
    const profissionalListKey = CacheKeyBuilder.buildList('agendamento', 'agendamento', { profissionalId: 'p1' });
    await sfc.set(clienteListKey, [{ id: 'ag-1' }], 60);
    await sfc.set(profissionalListKey, [{ id: 'ag-1' }], 60);

    // Publicar evento
    await publisher.publish({
      eventName: 'AgendamentoCriado',
      aggregateId: 'ag-2',
      clienteId: 'c1',
      profissionalId: 'p1',
    });

    assert.equal(await sfc.get(clienteListKey), null, 'lista do cliente deve ser invalidada');
    assert.equal(await sfc.get(profissionalListKey), null, 'lista do profissional deve ser invalidada');
  });

  it('FilaEntradaCriada invalida lista e contagem da barbearia', async () => {
    const { sfc } = buildPipeline();
    const publisher = DomainEventPublisher.getInstance();
    const subscriber = new CacheInvalidationSubscriber({ cache: sfc });
    subscriber.register(publisher);

    const countKey = CacheKeyBuilder.buildList('fila', 'count', { barbershopId: 'bs-1' });
    await sfc.set(countKey, 5, 60);
    const entradaKey = CacheKeyBuilder.build('fila', 'entrada', 'e-1');
    await sfc.set(entradaKey, { id: 'e-1' }, 60);

    await publisher.publish({
      eventName: 'FilaEntradaCriada',
      aggregateId: 'e-new',
      barbershopId: 'bs-1',
      clienteId: 'c-1',
    });

    assert.equal(await sfc.get(countKey), null, 'contagem deve ser invalidada');
    assert.equal(await sfc.get(entradaKey), null, 'entrada deve ser invalidada (prefixo)');
  });
});

// ── 5. IdempotencyMiddleware end-to-end ─────────────────────────
describe('[Integration] IdempotencyMiddleware pipeline', () => {
  const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('idempotência completa: 1ª cria, 2ª replica', async () => {
    const { sfc } = buildPipeline();
    const mw = new IdempotencyMiddleware({ cache: sfc, ttlSeconds: 10 });
    const handler = mw.handler();
    const req = { headers: { 'idempotency-key': VALID_UUID } };

    // Primeira chamada
    const res1 = {
      statusCode: 201, _body: null, _hdrs: {},
      status(c) { this.statusCode = c; return this; },
      json(b)   { this._body = b; return this; },
      setHeader(k, v) { this._hdrs[k] = v; },
    };
    let next1Called = false;
    await handler(req, res1, () => { next1Called = true; });
    assert.equal(next1Called, true);
    await res1.json({ id: 'new-resource' });

    // Segunda chamada — replica
    const res2 = {
      statusCode: 200, _body: null, _hdrs: {},
      status(c) { this.statusCode = c; return this; },
      json(b)   { this._body = b; return this; },
      setHeader(k, v) { this._hdrs[k] = v; },
    };
    let next2Called = false;
    await handler(req, res2, () => { next2Called = true; });

    assert.equal(next2Called, false, 'next não deve ser chamado');
    assert.equal(res2._hdrs['X-Idempotent-Replayed'], 'true');
    assert.deepEqual(res2._body, { id: 'new-resource' });
  });
});
