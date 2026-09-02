'use strict';
/**
 * tests/guest-fila-session-store.test.js
 *
 * Testa GuestFilaSessionStore: salvar/obter/limpar a referência local da
 * entrada de fila de um visitante sem conta, por barbershopId.
 */

const { describe, test } = require('node:test');
const assert            = require('node:assert/strict');
const vm                = require('node:vm');
const { fn, carregar }  = require('./_helpers.js');

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';

function criarSandbox(lsStore = {}) {
  const lsMap = new Map(Object.entries(lsStore));
  const sb = vm.createContext({
    console,
    JSON,
    localStorage: {
      getItem:    fn((k) => lsMap.get(k) ?? null),
      setItem:    fn((k, v) => lsMap.set(k, String(v))),
      removeItem: fn((k) => lsMap.delete(k)),
    },
  });
  carregar(sb, 'shared/js/GuestFilaSessionStore.js');
  return { sb, lsMap };
}

describe('GuestFilaSessionStore.salvar()', () => {
  test('persiste entradaId, guestName e guestPhone sob a chave da barbearia', () => {
    const { sb, lsMap } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e1', guestName: 'Alan', guestPhone: '11999998888' });

    const raw = lsMap.get(`bf:fila-convidado:${SHOP_A}`);
    assert.ok(raw);
    const dados = JSON.parse(raw);
    assert.equal(dados.entradaId, 'e1');
    assert.equal(dados.guestName, 'Alan');
    assert.equal(dados.guestPhone, '11999998888');
    assert.equal(typeof dados.criadoEm, 'number');
  });

  test('guestPhone é opcional (default null)', () => {
    const { sb, lsMap } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e1', guestName: 'Alan' });
    const dados = JSON.parse(lsMap.get(`bf:fila-convidado:${SHOP_A}`));
    assert.equal(dados.guestPhone, null);
  });

  test('não salva sem barbershopId ou sem entradaId', () => {
    const { sb, lsMap } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(null, { entradaId: 'e1', guestName: 'Alan' });
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: null, guestName: 'Alan' });
    assert.equal(lsMap.size, 0);
  });

  test('não lança se localStorage.setItem falhar (quota/modo privado)', () => {
    const sb = vm.createContext({
      console,
      JSON,
      localStorage: {
        setItem: fn(() => { throw new Error('QuotaExceededError'); }),
        getItem: fn(() => null),
        removeItem: fn(),
      },
    });
    carregar(sb, 'shared/js/GuestFilaSessionStore.js');
    assert.doesNotThrow(() => sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e1', guestName: 'Alan' }));
  });

  test('barbearias diferentes não se sobrescrevem', () => {
    const { sb, lsMap } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e-a', guestName: 'Alan' });
    sb.GuestFilaSessionStore.salvar(SHOP_B, { entradaId: 'e-b', guestName: 'Bia' });
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_A).entradaId, 'e-a');
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_B).entradaId, 'e-b');
  });
});

describe('GuestFilaSessionStore.obter()', () => {
  test('retorna null quando não há nada salvo', () => {
    const { sb } = criarSandbox();
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_A), null);
  });

  test('retorna null para barbershopId ausente', () => {
    const { sb } = criarSandbox();
    assert.equal(sb.GuestFilaSessionStore.obter(null), null);
  });

  test('retorna os dados salvos', () => {
    const { sb } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e1', guestName: 'Alan', guestPhone: '119999' });
    const dados = sb.GuestFilaSessionStore.obter(SHOP_A);
    assert.equal(dados.entradaId, 'e1');
    assert.equal(dados.guestName, 'Alan');
  });

  test('retorna null se o JSON salvo estiver corrompido', () => {
    const { sb, lsMap } = criarSandbox();
    lsMap.set(`bf:fila-convidado:${SHOP_A}`, '{not-json');
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_A), null);
  });

  test('retorna null se o objeto salvo não tiver entradaId', () => {
    const { sb, lsMap } = criarSandbox();
    lsMap.set(`bf:fila-convidado:${SHOP_A}`, JSON.stringify({ guestName: 'Alan' }));
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_A), null);
  });
});

describe('GuestFilaSessionStore.limpar()', () => {
  test('remove a entrada da barbearia informada, sem afetar outras', () => {
    const { sb } = criarSandbox();
    sb.GuestFilaSessionStore.salvar(SHOP_A, { entradaId: 'e-a', guestName: 'Alan' });
    sb.GuestFilaSessionStore.salvar(SHOP_B, { entradaId: 'e-b', guestName: 'Bia' });

    sb.GuestFilaSessionStore.limpar(SHOP_A);

    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_A), null);
    assert.equal(sb.GuestFilaSessionStore.obter(SHOP_B).entradaId, 'e-b');
  });

  test('não lança para barbershopId ausente', () => {
    const { sb } = criarSandbox();
    assert.doesNotThrow(() => sb.GuestFilaSessionStore.limpar(null));
  });
});
