'use strict';
// =============================================================
// user-repository.test.js
//
// Testa UserRepository — buscarUsuarios() e getFavoritosModal()
// via ApiService.rpc() mockado em sandbox VM.
// =============================================================

const { test, suite } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const { fn, carregar } = require('./_helpers');

const UUID_SHOP = 'fd8b24f5-8703-4baa-9ac8-6cf3ad40e407';
const UUID_PROF = '6fe08135-8c1d-4580-81db-5a8cfa96e9d2';

// ─── Factory de sandbox ───────────────────────────────────────────────────────

function criarSandbox({
  rpcRetorno        = { data: [], error: null },
  rpcRetornoPorNome = {},
  fromRetorno       = { data: [], error: null },
} = {}) {
  const rpcSpy = fn().mockImplementation((name) =>
    Promise.resolve(rpcRetornoPorNome[name] ?? rpcRetorno),
  );
  const fromSpy = {
    select: fn().mockReturnThis(),
    ilike:  fn().mockReturnThis(),
    eq:     fn().mockReturnThis(),
    in:     fn().mockReturnThis(),
    order:  fn().mockReturnThis(),
    range:  fn().mockImplementation(() => Promise.resolve(fromRetorno)),
    then:   fn().mockImplementation(cb => Promise.resolve(fromRetorno).then(cb)),
  };

  const ApiService = {
    rpc:  rpcSpy,
    from: fn().mockReturnValue(fromSpy),
  };

  // InputValidator mínimo para uuid()
  const InputValidator = {
    uuid: (v) => ({ ok: /^[0-9a-f-]{36}$/i.test(v), msg: 'UUID inválido' }),
  };

  const sandbox = vm.createContext({ console, ApiService, InputValidator });
  carregar(sandbox, 'shared/js/UserRepository.js');

  return { sandbox, ApiService, fromSpy };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function criarRows(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id:          `user-${offset + i + 1}`,
    full_name:   `Usuário ${offset + i + 1}`,
    email:       `user${offset + i + 1}@test.com`,
    avatar_path: null,
    updated_at:  null,
    total_count: 42,
  }));
}

// ─── Testes ───────────────────────────────────────────────────────────────────

suite('UserRepository — buscarUsuarios', () => {

  test('chama ApiService.rpc("search_users") com os parâmetros corretos', async () => {
    const rows = criarRows(3);
    const { sandbox, ApiService } = criarSandbox({
      rpcRetorno: { data: rows, error: null },
    });

    await sandbox.UserRepository.buscarUsuarios('alan', { limit: 10, offset: 5 });

    assert.strictEqual(ApiService.rpc.calls.length, 1);
    const [fn, body] = ApiService.rpc.calls[0];
    assert.strictEqual(fn, 'search_users');
    assert.strictEqual(body.p_term,   'alan');
    assert.strictEqual(body.p_role,   null);
    assert.strictEqual(body.p_limit,  10);
    assert.strictEqual(body.p_offset, 5);
  });

  test('extrai total de rows[0].total_count', async () => {
    const rows = criarRows(5); // total_count = 42 em cada row
    const { sandbox } = criarSandbox({ rpcRetorno: { data: rows, error: null } });

    const { total } = await sandbox.UserRepository.buscarUsuarios('joão');

    assert.strictEqual(total, 42);
  });

  test('retorna itens mapeados com campos esperados', async () => {
    const rows = criarRows(2);
    const { sandbox } = criarSandbox({ rpcRetorno: { data: rows, error: null } });

    const { data, total, error } = await sandbox.UserRepository.buscarUsuarios('ana');

    assert.strictEqual(error, null);
    assert.strictEqual(data.length, 2);
    assert.ok('id'          in data[0]);
    assert.ok('full_name'   in data[0]);
    assert.ok('email'       in data[0]);
    assert.ok('avatar_path' in data[0]);
    assert.ok('updated_at'  in data[0]);
    assert.strictEqual(total, 42);
  });

  test('total = 0 quando data é array vazio', async () => {
    const { sandbox } = criarSandbox({ rpcRetorno: { data: [], error: null } });
    const { data, total, error } = await sandbox.UserRepository.buscarUsuarios('xyz');
    assert.strictEqual(error,  null);
    assert.strictEqual(total,  0);
    assert.strictEqual(data.length, 0);
  });

  test('limit acima de 50 é normalizado para 50', async () => {
    const { sandbox, ApiService } = criarSandbox({ rpcRetorno: { data: [], error: null } });
    await sandbox.UserRepository.buscarUsuarios('a', { limit: 999 });
    const [, body] = ApiService.rpc.calls[0];
    assert.strictEqual(body.p_limit, 50);
  });

  test('offset negativo é normalizado para 0', async () => {
    const { sandbox, ApiService } = criarSandbox({ rpcRetorno: { data: [], error: null } });
    await sandbox.UserRepository.buscarUsuarios('a', { offset: -5 });
    const [, body] = ApiService.rpc.calls[0];
    assert.strictEqual(body.p_offset, 0);
  });

  test('AbortError: retorna { data:[], total:0, error } sem lançar', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { sandbox } = criarSandbox({ rpcRetorno: { data: null, error: abortErr } });

    const { data, total, error } = await sandbox.UserRepository.buscarUsuarios('alan');
    assert.strictEqual(data.length, 0);
    assert.strictEqual(total, 0);
    assert.strictEqual(error?.name, 'AbortError');
  });

  test('erro genérico: retorna { data:[], total:0, error }', async () => {
    const { sandbox } = criarSandbox({
      rpcRetorno: { data: null, error: new Error('DB error') },
    });
    const { data, total, error } = await sandbox.UserRepository.buscarUsuarios('z');
    assert.strictEqual(data.length, 0);
    assert.strictEqual(total, 0);
    assert.ok(error instanceof Error);
  });

});

suite('UserRepository — getFavoritosModal', () => {

  test('chama ApiService.rpc("get_clientes_favoritos_modal") com os parâmetros corretos', async () => {
    const { sandbox, ApiService } = criarSandbox({ rpcRetorno: { data: [], error: null } });

    await sandbox.UserRepository.getFavoritosModal(UUID_SHOP, UUID_PROF);

    assert.strictEqual(ApiService.rpc.calls.length, 1);
    const [fn, body] = ApiService.rpc.calls[0];
    assert.strictEqual(fn, 'get_clientes_favoritos_modal');
    assert.strictEqual(body.p_barbershop_id,   UUID_SHOP);
    assert.strictEqual(body.p_professional_id, UUID_PROF);
  });

  test('retorna lista mapeada corretamente', async () => {
    const rows = [
      { id: 'u1', full_name: 'Alan de Lima', email: 'delima@gmail.com', avatar_path: null, updated_at: null },
      { id: 'u2', full_name: 'Maria',        email: null,               avatar_path: null, updated_at: null },
    ];
    const { sandbox } = criarSandbox({ rpcRetorno: { data: rows, error: null } });

    const { data, error } = await sandbox.UserRepository.getFavoritosModal(UUID_SHOP, UUID_PROF);

    assert.strictEqual(error, null);
    assert.strictEqual(data.length, 2);
    assert.strictEqual(data[0].full_name, 'Alan de Lima');
    assert.strictEqual(data[0].email,     'delima@gmail.com');
    assert.strictEqual(data[1].email,     null);
  });

  test('erro propagado como { data:[], error }', async () => {
    const { sandbox } = criarSandbox({
      rpcRetorno: { data: null, error: new Error('RPC failed') },
    });
    const { data, error } = await sandbox.UserRepository.getFavoritosModal(UUID_SHOP, UUID_PROF);
    assert.strictEqual(data.length, 0);
    assert.ok(error instanceof Error);
  });

  test('UUID inválido para barbershopId lança TypeError', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.UserRepository.getFavoritosModal('nao-uuid', UUID_PROF),
      err => err.name === 'TypeError',
    );
  });

  test('UUID inválido para professionalId lança TypeError', async () => {
    const { sandbox } = criarSandbox();
    await assert.rejects(
      () => sandbox.UserRepository.getFavoritosModal(UUID_SHOP, 'nao-uuid'),
      err => err.name === 'TypeError',
    );
  });

});

// ─── Fallback de busca ────────────────────────────────────────────────────────

const PGRST202 = Object.freeze(Object.assign(new Error('not found'), { code: 'PGRST202' }));

suite('UserRepository — buscarUsuarios (fallback #buscarFallback)', () => {

  test('search_users falha com PGRST202 → chama buscar_perfis_por_nome', async () => {
    const perfisRows = [
      { id: 'u1', full_name: 'Carla', avatar_path: null, updated_at: null },
    ];
    const { sandbox, ApiService } = criarSandbox({
      rpcRetornoPorNome: {
        search_users:           { data: null,      error: PGRST202 },
        buscar_perfis_por_nome: { data: perfisRows, error: null    },
      },
    });

    const { data, total, error } = await sandbox.UserRepository.buscarUsuarios('carl', { limit: 20, offset: 0 });

    const nomes = ApiService.rpc.calls.map(c => c[0]);
    assert.ok(nomes.includes('search_users'),           'deve chamar search_users primeiro');
    assert.ok(nomes.includes('buscar_perfis_por_nome'), 'deve chamar buscar_perfis_por_nome no fallback');
    assert.strictEqual(error,             null);
    assert.strictEqual(data.length,       1);
    assert.strictEqual(data[0].full_name, 'Carla');
    assert.strictEqual(data[0].email,     null);   // RPC não retorna email → mapper usa ?? null
    assert.strictEqual(total,             1);
  });

  test('buscar_perfis_por_nome recebe p_limite = Math.min(offset + limit, 50)', async () => {
    const { sandbox, ApiService } = criarSandbox({
      rpcRetornoPorNome: {
        search_users:           { data: null, error: PGRST202 },
        buscar_perfis_por_nome: { data: [],   error: null     },
      },
    });

    await sandbox.UserRepository.buscarUsuarios('teste', { limit: 10, offset: 20 });

    const chamada = ApiService.rpc.calls.find(c => c[0] === 'buscar_perfis_por_nome');
    assert.ok(chamada, 'deve ter chamado buscar_perfis_por_nome');
    assert.strictEqual(chamada[1].p_termo,  'teste');
    assert.strictEqual(chamada[1].p_limite, Math.min(20 + 10, 50)); // 30
  });

  test('p_limite nunca excede 50 mesmo com offset + limit > 50', async () => {
    const { sandbox, ApiService } = criarSandbox({
      rpcRetornoPorNome: {
        search_users:           { data: null, error: PGRST202 },
        buscar_perfis_por_nome: { data: [],   error: null     },
      },
    });

    await sandbox.UserRepository.buscarUsuarios('x', { limit: 20, offset: 40 });

    const chamada = ApiService.rpc.calls.find(c => c[0] === 'buscar_perfis_por_nome');
    assert.ok(chamada);
    assert.strictEqual(chamada[1].p_limite, 50); // Math.min(40 + 20, 50) = 50
  });

  test('buscar_perfis_por_nome também falha (PGRST202) → usa query direta via from()', async () => {
    const { sandbox, ApiService } = criarSandbox({
      rpcRetornoPorNome: {
        search_users:           { data: null, error: PGRST202 },
        buscar_perfis_por_nome: { data: null, error: PGRST202 },
      },
      fromRetorno: {
        data:  [{ id: 'u1', full_name: 'Direto', email: null, avatar_path: null, updated_at: null }],
        error: null,
      },
    });

    const { data, error } = await sandbox.UserRepository.buscarUsuarios('dir');

    assert.strictEqual(error, null);
    assert.ok(ApiService.from.calls.length >= 1, 'deve usar ApiService.from como último recurso');
    assert.strictEqual(data[0].full_name, 'Direto');
  });

  test('resultado de buscar_perfis_por_nome é fatiado conforme offset e limit', async () => {
    // RPC retorna 5 itens (offset=0, p_limite=5), pedimos offset=2, limit=3 → slice(2,5)
    const perfisRows = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i + 1}`, full_name: `User ${i + 1}`, avatar_path: null, updated_at: null,
    }));
    const { sandbox } = criarSandbox({
      rpcRetornoPorNome: {
        search_users:           { data: null,      error: PGRST202 },
        buscar_perfis_por_nome: { data: perfisRows, error: null    },
      },
    });

    const { data, total } = await sandbox.UserRepository.buscarUsuarios('user', { limit: 3, offset: 2 });

    assert.strictEqual(data.length,       3);
    assert.strictEqual(data[0].full_name, 'User 3');
    assert.strictEqual(data[2].full_name, 'User 5');
    assert.strictEqual(total,             3);
  });

});
