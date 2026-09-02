'use strict';
/**
 * tests/guest-fila-service.test.js
 *
 * Testa GuestFilaService.entrar(): valida guestName, delega à BFF via
 * BffApiService.fila.entrarComoConvidado, propaga erro e persiste a
 * referência local via GuestFilaSessionStore.
 */

const { describe, test } = require('node:test');
const assert            = require('node:assert/strict');
const vm                = require('node:vm');
const { fn, carregar }  = require('./_helpers.js');

const SHOP = '11111111-1111-4111-8111-111111111111';
const PROF = '22222222-2222-4222-8222-222222222222';

function criarSandbox({ resultado = { data: { id: 'e1', guestName: 'Alan', guestPhone: '11999998888' }, error: null } } = {}) {
  const chamadas = { entrarComoConvidado: [], salvar: [] };
  const sb = vm.createContext({
    console,
    String,
    Error,
    BffApiService: {
      fila: {
        // JSON.stringify aqui, fora do sandbox: objetos criados dentro do VM
        // pertencem a outro realm e quebram deepEqual por reference-equality.
        entrarComoConvidado: fn((opts) => { chamadas.entrarComoConvidado.push(JSON.parse(JSON.stringify(opts))); return Promise.resolve(resultado); }),
      },
    },
    GuestFilaSessionStore: {
      salvar: fn((barbershopId, dados) => chamadas.salvar.push(JSON.parse(JSON.stringify({ barbershopId, dados })))),
    },
  });
  carregar(sb, 'shared/js/GuestFilaService.js');
  return { sb, chamadas };
}

describe('GuestFilaService.entrar()', () => {
  test('rejeita quando guestName está ausente', async () => {
    const { sb } = criarSandbox();
    await assert.rejects(
      () => sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: '' }),
      /guestName é obrigatório/,
    );
  });

  test('rejeita quando guestName é só espaços', async () => {
    const { sb } = criarSandbox();
    await assert.rejects(() => sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: '   ' }));
  });

  test('chama BffApiService.fila.entrarComoConvidado com os dados corretos, nome já trimado', async () => {
    const { sb, chamadas } = criarSandbox();
    await sb.GuestFilaService.entrar({
      barbershopId: SHOP, professionalId: PROF, guestName: '  Alan  ', guestPhone: '11999998888', serviceIds: ['s1'],
    });

    assert.equal(chamadas.entrarComoConvidado.length, 1);
    assert.deepEqual(chamadas.entrarComoConvidado[0], {
      barbershopId: SHOP, professionalId: PROF, guestName: 'Alan', guestPhone: '11999998888', serviceIds: ['s1'],
    });
  });

  test('guestPhone vazio vira null', async () => {
    const { sb, chamadas } = criarSandbox();
    await sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: 'Alan', guestPhone: '' });
    assert.equal(chamadas.entrarComoConvidado[0].guestPhone, null);
  });

  test('serviceIds tem default [] quando ausente', async () => {
    const { sb, chamadas } = criarSandbox();
    await sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: 'Alan' });
    assert.deepEqual(chamadas.entrarComoConvidado[0].serviceIds, []);
  });

  test('propaga o erro retornado pela BFF (sem lançar exceção genérica)', async () => {
    const erro = new Error('Barbearia está fechada no momento.');
    const { sb } = criarSandbox({ resultado: { data: null, error: erro } });
    await assert.rejects(
      () => sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: 'Alan' }),
      /fechada/,
    );
  });

  test('em sucesso, persiste a entrada no GuestFilaSessionStore', async () => {
    const { sb, chamadas } = criarSandbox();
    await sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: 'Alan', guestPhone: '11999998888' });

    assert.equal(chamadas.salvar.length, 1);
    assert.equal(chamadas.salvar[0].barbershopId, SHOP);
    assert.equal(chamadas.salvar[0].dados.entradaId, 'e1');
    assert.equal(chamadas.salvar[0].dados.guestName, 'Alan');
    assert.equal(chamadas.salvar[0].dados.guestPhone, '11999998888');
  });

  test('retorna os dados da entrada criada', async () => {
    const { sb } = criarSandbox();
    const entrada = await sb.GuestFilaService.entrar({ barbershopId: SHOP, guestName: 'Alan' });
    assert.equal(entrada.id, 'e1');
    assert.equal(entrada.guestName, 'Alan');
  });
});
