'use strict';
// =============================================================================
// favoritos-clientes-service.test.js — testes da classe FavoritosClientesService
//
// Cobertura:
//   - listarPorBarbeiro: UUID inválido lança antes de qualquer rede
//   - listarPorBarbeiro: delega a UserRepository.getFavoritosModal
//   - listarPorBarbeiro: erro do repositório é propagado
//   - listarPorBarbearia: UUID inválido lança
//   - listarPorBarbearia: delega a UserRepository.getFavoritosBarbearia
//   - normalização: nulls em full_name viram "Cliente"
// =============================================================================

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_SHOP = 'fd8b24f5-8703-4baa-9ac8-6cf3ad40e407';
const UUID_PROF = '6fe08135-8c1d-4580-81db-5a8cfa96e9d2';
const ID_USR_1  = '11111111-0000-4000-8000-000000000101';
const ID_USR_2  = '22222222-0000-4000-8000-000000000102';

function criarSandbox() {
  const ctx = {
    InputValidator: {
      uuid: (v) => {
        const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return typeof v === 'string' && re.test(v)
          ? { ok: true }
          : { ok: false, msg: 'UUID inválido' };
      },
    },
    UserRepository: {
      getFavoritosModal:    fn(),
      getFavoritosBarbearia: fn(),
    },
  };
  const sandbox = vm.createContext(ctx);
  carregar(sandbox, 'shared/js/FavoritosClientesService.js');
  return sandbox;
}

suite('FavoritosClientesService.listarPorBarbeiro', () => {

  test('barbershopId não-UUID: lança TypeError', async () => {
    const s = criarSandbox();
    await assert.rejects(
      () => s.FavoritosClientesService.listarPorBarbeiro('xxx', UUID_PROF),
      (err) => err.name === 'TypeError' && /barbershopId/.test(err.message),
    );
  });

  test('professionalId não-UUID: lança TypeError', async () => {
    const s = criarSandbox();
    await assert.rejects(
      () => s.FavoritosClientesService.listarPorBarbeiro(UUID_SHOP, 'xxx'),
      (err) => err.name === 'TypeError' && /professionalId/.test(err.message),
    );
  });

  test('delega a UserRepository.getFavoritosModal e normaliza', async () => {
    const s = criarSandbox();
    s.UserRepository.getFavoritosModal.mockResolvedValue({
      data: [
        { id: ID_USR_1, full_name: 'Alice', email: 'a@x.com', avatar_path: null, updated_at: null },
        { id: ID_USR_2, full_name: null,    email: null,      avatar_path: null, updated_at: null },
      ],
      error: null,
    });

    const lista = await s.FavoritosClientesService.listarPorBarbeiro(UUID_SHOP, UUID_PROF);
    assert.strictEqual(s.UserRepository.getFavoritosModal.calls.length, 1);
    assert.deepStrictEqual(s.UserRepository.getFavoritosModal.calls[0], [UUID_SHOP, UUID_PROF]);
    assert.strictEqual(lista.length, 2);
    assert.strictEqual(lista[0].full_name, 'Alice');
    assert.strictEqual(lista[1].full_name, 'Cliente'); // null normalizado
  });

  test('repositório retorna erro: rejeita com o erro', async () => {
    const s = criarSandbox();
    const err = new Error('boom');
    s.UserRepository.getFavoritosModal.mockResolvedValue({ data: [], error: err });

    await assert.rejects(
      () => s.FavoritosClientesService.listarPorBarbeiro(UUID_SHOP, UUID_PROF),
      (e) => e === err,
    );
  });

  test('repositório retorna data null: devolve []', async () => {
    const s = criarSandbox();
    s.UserRepository.getFavoritosModal.mockResolvedValue({ data: null, error: null });

    const lista = await s.FavoritosClientesService.listarPorBarbeiro(UUID_SHOP, UUID_PROF);
    assert.strictEqual(lista.length, 0);
  });
});

suite('FavoritosClientesService.listarPorBarbearia', () => {

  test('barbershopId não-UUID: lança TypeError', async () => {
    const s = criarSandbox();
    await assert.rejects(
      () => s.FavoritosClientesService.listarPorBarbearia('xxx'),
      (err) => err.name === 'TypeError' && /barbershopId/.test(err.message),
    );
  });

  test('delega a UserRepository.getFavoritosBarbearia e normaliza', async () => {
    const s = criarSandbox();
    s.UserRepository.getFavoritosBarbearia.mockResolvedValue({
      data: [
        { id: ID_USR_1, full_name: 'Bruno', email: null, avatar_path: 'foo.png', updated_at: '2026-05-01T00:00:00Z' },
      ],
      error: null,
    });

    const lista = await s.FavoritosClientesService.listarPorBarbearia(UUID_SHOP);
    assert.strictEqual(s.UserRepository.getFavoritosBarbearia.calls.length, 1);
    assert.deepStrictEqual(s.UserRepository.getFavoritosBarbearia.calls[0], [UUID_SHOP]);
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].id, ID_USR_1);
    assert.strictEqual(lista[0].avatar_path, 'foo.png');
  });

  test('repositório retorna erro: rejeita com o erro', async () => {
    const s = criarSandbox();
    const err = new Error('db down');
    s.UserRepository.getFavoritosBarbearia.mockResolvedValue({ data: [], error: err });

    await assert.rejects(
      () => s.FavoritosClientesService.listarPorBarbearia(UUID_SHOP),
      (e) => e === err,
    );
  });

  test('repositório retorna data null: devolve []', async () => {
    const s = criarSandbox();
    s.UserRepository.getFavoritosBarbearia.mockResolvedValue({ data: null, error: null });

    const lista = await s.FavoritosClientesService.listarPorBarbearia(UUID_SHOP);
    assert.strictEqual(lista.length, 0);
  });
});
