'use strict';
// =============================================================
// search-repository.test.js — Testes de SearchRepository
//
// Framework: node:test + node:assert/strict
// Sem Jest/Vitest. Sem dependências externas.
// =============================================================

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

// ── Helpers de mocking ─────────────────────────────────────

/**
 * Cria uma função espiã compatível com node:test.
 * Rastreia chamadas e permite configurar retorno.
 */
function fn(impl) {
  let _impl = impl ?? (() => undefined);
  const spy = (...args) => { spy.calls.push(args); return _impl(...args); };
  spy.calls             = [];
  spy.mockResolvedValue = (v) => { _impl = () => Promise.resolve(v); return spy; };
  spy.mockRejectedValue = (e) => { _impl = () => Promise.reject(e);  return spy; };
  spy.mockClear         = ()  => { spy.calls = [];                    return spy; };
  return spy;
}

/**
 * Cria um mock do Supabase client com `rpc` espião.
 * @param {{ data?: unknown, error?: unknown }} opts
 */
function mockSupabase({ data = [], error = null } = {}) {
  return { rpc: fn().mockResolvedValue({ data, error }) };
}

// ── Carrega a classe em isolamento (sem criar servidor) ─────

const SearchRepository = require(
  path.resolve(__dirname, '../src/repositories/SearchRepository')
);

// ── UUID válido para testes ──────────────────────────────────
// Formato RFC 4122: [1-5] no 3º grupo, [89ab] no 4º grupo
const UUID_A = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
const UUID_B = 'b2c3d4e5-f6a7-4901-bcde-f01234567891';

// ══════════════════════════════════════════════════════════════
// searchUsers
// ══════════════════════════════════════════════════════════════

test('searchUsers — chama rpc("search_users") com os parâmetros corretos', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.searchUsers({ term: 'delima', limit: 10, offset: 5 });

  assert.equal(supabase.rpc.calls.length, 1);
  const [fnName, params] = supabase.rpc.calls[0];
  assert.equal(fnName, 'search_users');
  assert.equal(params.p_term,   'delima');
  assert.equal(params.p_role,   null);
  assert.equal(params.p_limit,  10);
  assert.equal(params.p_offset, 5);
});

test('searchUsers — filtro de role é repassado como p_role', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.searchUsers({ term: 'joão', role: 'client' });

  const [, params] = supabase.rpc.calls[0];
  assert.equal(params.p_role, 'client');
});

test('searchUsers — sem role → p_role é null', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.searchUsers({ term: 'ana' });

  const [, params] = supabase.rpc.calls[0];
  assert.equal(params.p_role, null);
});

test('searchUsers — limit acima de 50 é normalizado para 50', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.searchUsers({ term: 'fulano', limit: 200 });

  const [, params] = supabase.rpc.calls[0];
  assert.equal(params.p_limit, 50);
});

test('searchUsers — offset negativo é normalizado para 0', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.searchUsers({ term: 'beltrano', offset: -10 });

  const [, params] = supabase.rpc.calls[0];
  assert.equal(params.p_offset, 0);
});

test('searchUsers — retorna { itens, total } com campos esperados', async () => {
  const row = {
    id: UUID_A, full_name: 'Ana Silva', email: 'ana@x.com',
    role: 'client', avatar_path: '/img/ana.jpg',
    barbershop_name: null, updated_at: '2025-01-01T00:00:00Z',
    total_count: 1,
  };
  const supabase = mockSupabase({ data: [row] });
  const repo     = new SearchRepository(supabase);

  const result = await repo.searchUsers({ term: 'ana' });

  // Deve retornar objeto com itens e total
  assert.ok(Array.isArray(result.itens), 'result.itens deve ser array');
  assert.equal(result.total,           1);
  assert.equal(result.itens.length,    1);
  assert.equal(result.itens[0].id,        UUID_A);
  assert.equal(result.itens[0].full_name, 'Ana Silva');
  assert.equal(result.itens[0].email,     'ana@x.com');
  assert.equal(result.itens[0].role,      'client');
});

test('searchUsers — total vem de total_count da primeira row', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `a1b2c3d4-e5f6-4890-abcd-ef123456789${i}`,
    full_name: `User ${i}`, email: `u${i}@x.com`, role: 'client',
    avatar_path: null, barbershop_name: null, updated_at: null,
    total_count: 42, // total real — maior que o tamanho da página
  }));
  const supabase = mockSupabase({ data: rows });
  const repo     = new SearchRepository(supabase);

  const result = await repo.searchUsers({ term: 'user' });

  assert.equal(result.total, 42, 'total deve vir de total_count, não do tamanho da página');
  assert.equal(result.itens.length, 5);
});

test('searchUsers — fallback quando RPC não existe (código PGRST202)', async () => {
  // Simula banco sem a RPC: rpc() retorna erro PGRST202;
  // fallback usa query direta via .from('profiles')
  const rpcError = Object.assign(new Error('Could not find the function'), { code: 'PGRST202' });
  const profileRows = [
    { id: UUID_A, full_name: 'Fallback User', email: 'fb@x.com', role: 'client', avatar_path: null, updated_at: null },
  ];

  // Builder encadeável compatível com node:test (sem mockReturnThis do Jest)
  const rangeResult = { data: profileRows, error: null, count: 1 };
  const builder = {
    select: () => builder,
    ilike:  () => builder,
    eq:     () => builder,
    order:  () => builder,
    range:  () => Promise.resolve(rangeResult),
  };
  const rpcSpy = fn().mockResolvedValue({ data: null, error: rpcError });
  const supabase = { rpc: rpcSpy, from: () => builder };

  const repo   = new SearchRepository(supabase);
  const result = await repo.searchUsers({ term: 'fallback' });

  assert.ok(Array.isArray(result.itens), 'itens deve ser array no fallback');
  assert.equal(result.itens.length, 1);
  assert.equal(result.itens[0].full_name, 'Fallback User');
});

test('searchUsers — term vazio lança TypeError', async () => {
  const repo = new SearchRepository(mockSupabase());

  await assert.rejects(
    () => repo.searchUsers({ term: '   ' }),
    TypeError
  );
});

test('searchUsers — term com mais de 100 chars lança TypeError', async () => {
  const repo = new SearchRepository(mockSupabase());
  const longTerm = 'x'.repeat(101);

  await assert.rejects(
    () => repo.searchUsers({ term: longTerm }),
    TypeError
  );
});

test('searchUsers — role inválida lança TypeError', async () => {
  const repo = new SearchRepository(mockSupabase());

  await assert.rejects(
    () => repo.searchUsers({ term: 'abc', role: 'admin' }),
    TypeError
  );
});

test('searchUsers — erro do Supabase é propagado (código genérico)', async () => {
  const supabase = mockSupabase({ data: null, error: Object.assign(new Error('DB error'), { code: '500' }) });
  const repo     = new SearchRepository(supabase);

  await assert.rejects(
    () => repo.searchUsers({ term: 'erro' }),
    /DB error/
  );
});

// ══════════════════════════════════════════════════════════════
// getFavoriteClients
// ══════════════════════════════════════════════════════════════

test('getFavoriteClients — chama rpc("get_clientes_favoritos_modal") com UUIDs corretos', async () => {
  const supabase = mockSupabase({ data: [] });
  const repo     = new SearchRepository(supabase);

  await repo.getFavoriteClients(UUID_A, UUID_B);

  assert.equal(supabase.rpc.calls.length, 1);
  const [fnName, params] = supabase.rpc.calls[0];
  assert.equal(fnName, 'get_clientes_favoritos_modal');
  assert.equal(params.p_barbershop_id,   UUID_A);
  assert.equal(params.p_professional_id, UUID_B);
});

test('getFavoriteClients — retorna { itens, total } de favoritos mapeado', async () => {
  const row = { id: UUID_B, full_name: 'Carlos', email: 'carlos@x.com', avatar_path: null, updated_at: null };
  const supabase = mockSupabase({ data: [row] });
  const repo     = new SearchRepository(supabase);

  const result = await repo.getFavoriteClients(UUID_A, UUID_B);

  assert.ok(Array.isArray(result.itens), 'result.itens deve ser array');
  assert.equal(result.total,             1);
  assert.equal(result.itens.length,      1);
  assert.equal(result.itens[0].id,        UUID_B);
  assert.equal(result.itens[0].full_name, 'Carlos');
  assert.equal(result.itens[0].email,     'carlos@x.com');
});

test('getFavoriteClients — full_name null usa "Cliente" como fallback', async () => {
  const row = { id: UUID_B, full_name: null, email: null, avatar_path: null, updated_at: null };
  const supabase = mockSupabase({ data: [row] });
  const repo     = new SearchRepository(supabase);

  const { itens } = await repo.getFavoriteClients(UUID_A, UUID_B);
  assert.equal(itens[0].full_name, 'Cliente');
  assert.equal(itens[0].email,     null);
});

test('getFavoriteClients — barbershopId inválido lança TypeError', async () => {
  const repo = new SearchRepository(mockSupabase());

  await assert.rejects(
    () => repo.getFavoriteClients('not-a-uuid', UUID_B),
    TypeError
  );
});

test('getFavoriteClients — professionalId inválido lança TypeError', async () => {
  const repo = new SearchRepository(mockSupabase());

  await assert.rejects(
    () => repo.getFavoriteClients(UUID_A, 'bad'),
    TypeError
  );
});

test('getFavoriteClients — erro do Supabase é propagado', async () => {
  const supabase = mockSupabase({ data: null, error: new Error('Network failure') });
  const repo     = new SearchRepository(supabase);

  await assert.rejects(
    () => repo.getFavoriteClients(UUID_A, UUID_B),
    /Network failure/
  );
});

// ══════════════════════════════════════════════════════════════
// Construtor
// ══════════════════════════════════════════════════════════════

test('construtor — lança TypeError se supabase for omitido', () => {
  assert.throws(
    () => new SearchRepository(null),
    TypeError
  );
});

test('construtor — aceita supabase client válido', () => {
  assert.doesNotThrow(() => new SearchRepository(mockSupabase()));
});
