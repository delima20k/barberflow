'use strict';
/**
 * tests/auth-backend.test.js
 *
 * Testa CadastroService e AuthController (cadastro-perfil) do backend Node.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER = '00000000-0000-4000-8000-000000000001';

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(), upsert: fn(),
    eq:     fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = ['select','insert','update','upsert','eq'];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const CadastroService    = require('../src/services/CadastroService');
const AuthRepository     = require('../src/repositories/AuthRepository');

// ─────────────────────────────────────────────────────────────────────────────
// AuthRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthRepository.criarPerfil()', () => {

  test('faz upsert na tabela profiles', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_USER, full_name: 'João' } });
    const repo = new AuthRepository(supabase);
    await repo.criarPerfil(UUID_USER, { full_name: 'João', phone: null });
    assert.ok(supabase.from.calls.some(([t]) => t === 'profiles'));
  });

  test('lança TypeError para UUID inválido', async () => {
    const { supabase } = criarSupabaseMock();
    const repo = new AuthRepository(supabase);
    await assert.rejects(() => repo.criarPerfil('invalido', { full_name: 'João' }), TypeError);
  });
});

suite('AuthRepository.criarBarbearia()', () => {

  test('insere na tabela barbershops', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: 'shop-1', name: 'Barbearia X' } });
    const repo = new AuthRepository(supabase);
    await repo.criarBarbearia(UUID_USER, 'Barbearia X');
    assert.ok(supabase.from.calls.some(([t]) => t === 'barbershops'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CadastroService
// ─────────────────────────────────────────────────────────────────────────────

function criarCadastroService({ perfil = null, barbearia = null } = {}) {
  const repo = {
    criarPerfil:    fn().mockResolvedValue(perfil ?? { id: UUID_USER, full_name: 'João' }),
    criarBarbearia: fn().mockResolvedValue(barbearia ?? { id: 'shop-1', name: 'Barbearia X' }),
  };
  return { service: new CadastroService(repo), repo };
}

suite('CadastroService.cadastrarPerfil()', () => {

  test('lança 400 quando userId está ausente', async () => {
    const { service } = criarCadastroService();
    await assert.rejects(
      () => service.cadastrarPerfil(null, { full_name: 'João', role: 'client' }),
      (err) => err.status === 400,
    );
  });

  test('lança 400 quando full_name está ausente', async () => {
    const { service } = criarCadastroService();
    await assert.rejects(
      () => service.cadastrarPerfil(UUID_USER, { role: 'client' }),
      (err) => err.status === 400,
    );
  });

  test('cria apenas perfil quando role é client', async () => {
    const { service, repo } = criarCadastroService();
    await service.cadastrarPerfil(UUID_USER, { full_name: 'João', role: 'client' });
    assert.strictEqual(repo.criarPerfil.calls.length, 1);
    assert.strictEqual(repo.criarBarbearia.calls.length, 0);
  });

  test('cria perfil + barbearia quando pro_type é barbearia', async () => {
    const { service, repo } = criarCadastroService();
    await service.cadastrarPerfil(UUID_USER, {
      full_name: 'Carlos',
      role:      'professional',
      pro_type:  'barbearia',
      barbearia: 'Barbearia do Carlos',
    });
    assert.strictEqual(repo.criarPerfil.calls.length, 1);
    assert.strictEqual(repo.criarBarbearia.calls.length, 1);
  });

  test('não cria barbearia quando pro_type é barber', async () => {
    const { service, repo } = criarCadastroService();
    await service.cadastrarPerfil(UUID_USER, {
      full_name: 'Carlos',
      role:      'professional',
      pro_type:  'barber',
    });
    assert.strictEqual(repo.criarBarbearia.calls.length, 0);
  });
});
