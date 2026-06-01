'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }            = require('../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }           = require('../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }      = require('../../../infrastructure/cache/SingleFlightCache');
const { CachedUseCaseDecorator } = require('../../../application/shared/CachedUseCaseDecorator');
const { Result }                 = require('../../../domain/shared/Result');

class FakeUseCase {
  #callCount = 0;
  #result;
  constructor(result) { this.#result = result; }
  get callCount() { return this.#callCount; }
  async execute(_cmd) { this.#callCount++; return this.#result; }
}

function makeSFC() {
  return new SingleFlightCache({ cache: new MemoryCache(), metrics: new CacheMetrics() });
}

describe('CachedUseCaseDecorator', () => {
  it('lança TypeError se useCase ausente', () => {
    assert.throws(() => new CachedUseCaseDecorator({ useCase: null, cacheService: makeSFC(), keyFn: () => 'k', ttlSeconds: 60 }), /useCase é obrigatório/);
  });

  it('lança TypeError se keyFn não é função', () => {
    assert.throws(() => new CachedUseCaseDecorator({ useCase: new FakeUseCase({}), cacheService: makeSFC(), keyFn: 'invalid', ttlSeconds: 60 }), /keyFn deve ser uma função/);
  });

  it('lança TypeError se ttlSeconds inválido', () => {
    assert.throws(() => new CachedUseCaseDecorator({ useCase: new FakeUseCase({}), cacheService: makeSFC(), keyFn: () => 'k', ttlSeconds: -1 }), /ttlSeconds deve ser número/);
  });

  it('cache miss: executa use case e armazena resultado', async () => {
    const uc  = new FakeUseCase(Result.ok({ id: '1' }));
    const sfc = makeSFC();
    const dec = new CachedUseCaseDecorator({
      useCase: uc, cacheService: sfc, keyFn: cmd => `test:${cmd.id}`, ttlSeconds: 60,
    });

    const r1 = await dec.execute({ id: '1' });
    assert.equal(r1.isOk(), true);
    assert.equal(uc.callCount, 1);
  });

  it('cache hit: não executa use case na segunda chamada', async () => {
    const uc  = new FakeUseCase(Result.ok({ id: '1' }));
    const sfc = makeSFC();
    const dec = new CachedUseCaseDecorator({
      useCase: uc, cacheService: sfc, keyFn: () => 'same-key', ttlSeconds: 60,
    });

    await dec.execute({ id: '1' });
    await dec.execute({ id: '1' });
    assert.equal(uc.callCount, 1, 'use case chamado apenas 1 vez');
  });

  it('chaves diferentes geram chamadas independentes', async () => {
    const uc  = new FakeUseCase(Result.ok({}));
    const sfc = makeSFC();
    const dec = new CachedUseCaseDecorator({
      useCase: uc, cacheService: sfc, keyFn: cmd => `k:${cmd.id}`, ttlSeconds: 60,
    });

    await dec.execute({ id: 'a' });
    await dec.execute({ id: 'b' });
    assert.equal(uc.callCount, 2);
  });

  it('erros do use case propagam sem polluar o cache', async () => {
    const brokenUc = {
      execute: async () => { throw new Error('fail'); },
    };
    const sfc = makeSFC();
    const dec = new CachedUseCaseDecorator({
      useCase: brokenUc, cacheService: sfc, keyFn: () => 'err-key', ttlSeconds: 60,
    });

    await assert.rejects(() => dec.execute({}), /fail/);
    assert.equal(await sfc.get('err-key'), null);
  });
});
