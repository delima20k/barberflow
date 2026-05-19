'use strict';
/**
 * tests/queue-repository.test.js
 *
 * Testa QueueRepository: getByBarbershop, getCadeiras, updateStatus.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_BARBER = 'b0000000-0000-4000-8000-000000000001';
const UUID_ENTRY  = 'e0000000-0000-4000-8000-000000000001';

function criarQueryBuilder(result) {
  const chain = {
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
    select: fn(), eq: fn(), neq: fn(), in: fn(), order: fn(), update: fn(),
  };
  const chainable = ['select','eq','neq','in','order','update'];
  for (const m of chainable) chain[m].mockReturnValue(chain);
  Object.defineProperty(chain, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  return chain;
}

function criarRepo({ data = [], error = null } = {}) {
  const result  = { data, error };
  const builder = criarQueryBuilder(result);
  const api     = { from: fn().mockReturnValue(builder) };

  const sb = vm.createContext({ console, ApiService: api });
  carregar(sb, 'shared/js/InputValidator.js');
  carregar(sb, 'shared/js/QueueRepository.js');

  return { QR: sb.QueueRepository, builder, api };
}

// ─────────────────────────────────────────────────────────────────────────────
// QueueRepository.getByBarbershop()
// ─────────────────────────────────────────────────────────────────────────────
suite('QueueRepository.getByBarbershop()', () => {

  test('chama ApiService.from("queue_entries")', async () => {
    const { QR, api } = criarRepo({ data: [] });
    await QR.getByBarbershop(UUID_BARBER);
    assert.ok(api.from.calls.some(([t]) => t === 'queue_entries'));
  });

  test('filtra pelo barbershop_id correto', async () => {
    const { QR, builder } = criarRepo({ data: [] });
    await QR.getByBarbershop(UUID_BARBER);
    assert.ok(builder.eq.calls.some(([col, val]) =>
      col === 'barbershop_id' && val === UUID_BARBER));
  });

  test('retorna array vazio quando data é null', async () => {
    const { QR } = criarRepo({ data: null });
    const result = await QR.getByBarbershop(UUID_BARBER);
    assert.strictEqual(result.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QueueRepository.updateStatus()
// ─────────────────────────────────────────────────────────────────────────────
suite('QueueRepository.updateStatus()', () => {

  test('rejeita UUID inválido com TypeError', async () => {
    const { QR } = criarRepo();
    await assert.rejects(
      () => QR.updateStatus('nao-e-uuid', 'waiting'),
      (err) => err.name === 'TypeError'
    );
  });

  test('rejeita status fora da allowlist', async () => {
    const { QR } = criarRepo();
    await assert.rejects(
      () => QR.updateStatus(UUID_ENTRY, 'pendente'),
      (err) => err instanceof Error || err.name === 'Error'
    );
  });

  test('aceita status "waiting" sem campos extras', async () => {
    const { QR, builder } = criarRepo({ data: { id: UUID_ENTRY, status: 'waiting' } });
    await QR.updateStatus(UUID_ENTRY, 'waiting');
    // Deve ter chamado .from('queue_entries')
    assert.ok(builder.eq.calls.length >= 1);
  });

  test('adiciona served_at ao patch quando status é "in_service"', async () => {
    const patchesChamados = [];
    const builder = {
      select: fn().mockReturnThis(),
      eq:     fn().mockReturnThis(),
      single: fn().mockResolvedValue({ data: {}, error: null }),
      update: fn((patch) => { patchesChamados.push(patch); return builder; }),
      in:     fn().mockReturnThis(),
      order:  fn().mockReturnThis(),
      neq:    fn().mockReturnThis(),
    };
    const api = { from: fn().mockReturnValue(builder) };

    const sb = vm.createContext({ console, ApiService: api });
    carregar(sb, 'shared/js/InputValidator.js');
    carregar(sb, 'shared/js/QueueRepository.js');

    await sb.QueueRepository.updateStatus(UUID_ENTRY, 'in_service');

    const patch = patchesChamados[0];
    assert.ok(patch, 'update() deveria ter sido chamado com um patch');
    assert.ok('served_at' in patch, 'patch deveria conter served_at para in_service');
  });

  test('adiciona done_at ao patch quando status é "done"', async () => {
    const patchesChamados = [];
    const builder = {
      select: fn().mockReturnThis(),
      eq:     fn().mockReturnThis(),
      single: fn().mockResolvedValue({ data: {}, error: null }),
      update: fn((patch) => { patchesChamados.push(patch); return builder; }),
      in:     fn().mockReturnThis(),
      order:  fn().mockReturnThis(),
      neq:    fn().mockReturnThis(),
    };
    const api = { from: fn().mockReturnValue(builder) };

    const sb = vm.createContext({ console, ApiService: api });
    carregar(sb, 'shared/js/InputValidator.js');
    carregar(sb, 'shared/js/QueueRepository.js');

    await sb.QueueRepository.updateStatus(UUID_ENTRY, 'done');

    const patch = patchesChamados[0];
    assert.ok(patch, 'update() deveria ter sido chamado com um patch');
    assert.ok('done_at' in patch, 'patch deveria conter done_at para done');
  });
});
