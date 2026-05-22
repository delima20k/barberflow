'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                        = require('node:assert/strict');
const { RateLimiter, SlidingWindow } = require('../../../middlewares/abuse/RateLimiter');
const { InMemoryStore }              = require('../../../middlewares/abuse/StoreAdapter');

// ─────────────────────────────────────────────────────────────────────────────
// Integração: rate limit sob carga concorrente
//
// Objetivo: garantir que, com N requisições simultâneas, exatamente `max`
// são permitidas e o restante é bloqueado — sem condição de corrida.
//
// JavaScript é single-threaded, portanto Promise.all executa microtasks
// sequencialmente no InMemoryStore, tornando este teste determinístico.
// ─────────────────────────────────────────────────────────────────────────────
describe('RateLimiter integração: carga concorrente', () => {
  const MAX        = 10;
  const TOTAL_REQS = 100;

  /** @type {InMemoryStore} */ let store;
  /** @type {RateLimiter} */   let limiter;

  beforeEach(() => {
    store   = new InMemoryStore();
    limiter = new RateLimiter(new SlidingWindow({ store, windowMs: 60_000, max: MAX }));
  });

  it(`${TOTAL_REQS} requisições simultâneas: exatamente ${MAX} permitidas`, async () => {
    const resultados = await Promise.all(
      Array.from({ length: TOTAL_REQS }, () => limiter.consume('concurrent-key')),
    );

    const permitidas = resultados.filter(r => r.allowed).length;
    const bloqueadas = resultados.filter(r => !r.allowed).length;

    assert.equal(permitidas, MAX,              `esperado ${MAX} permitidas, obteve ${permitidas}`);
    assert.equal(bloqueadas, TOTAL_REQS - MAX, `esperado ${TOTAL_REQS - MAX} bloqueadas`);
  });

  it('chaves distintas têm contadores independentes sob carga', async () => {
    const usuarios = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const reqs     = usuarios.flatMap(id =>
      Array.from({ length: 15 }, () => limiter.consume(id)),
    );

    const todos = await Promise.all(reqs);
    const porUsuario = {};
    usuarios.forEach(id => { porUsuario[id] = { permitidas: 0, bloqueadas: 0 }; });

    // Reconstruir por usuário: cada bloco de 15 pertence a um usuário
    usuarios.forEach((id, uIdx) => {
      const slice = todos.slice(uIdx * 15, uIdx * 15 + 15);
      porUsuario[id].permitidas = slice.filter(r => r.allowed).length;
      porUsuario[id].bloqueadas = slice.filter(r => !r.allowed).length;
    });

    for (const id of usuarios) {
      assert.equal(porUsuario[id].permitidas, MAX,       `${id}: esperado ${MAX} permitidas`);
      assert.equal(porUsuario[id].bloqueadas, 15 - MAX,  `${id}: esperado ${15 - MAX} bloqueadas`);
    }
  });

  it('reset efetivo mesmo após carga: permite nova janela', async () => {
    await Promise.all(Array.from({ length: TOTAL_REQS }, () => limiter.consume('reset-key')));

    // Tudo bloqueado após MAX
    assert.equal((await limiter.consume('reset-key')).allowed, false);

    await limiter.reset('reset-key');

    // Após reset, deve permitir novamente
    assert.equal((await limiter.consume('reset-key')).allowed, true);
  });

  it('remaining nunca vai abaixo de 0', async () => {
    const reqs = await Promise.all(
      Array.from({ length: MAX + 5 }, () => limiter.consume('neg-test')),
    );
    for (const r of reqs) {
      assert.ok(r.remaining >= 0, `remaining ${r.remaining} não deve ser negativo`);
    }
  });
});
