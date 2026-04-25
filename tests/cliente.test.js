'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const UUID_CLIENTE = 'b0000000-0000-4000-8000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sandbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria sandbox com fetch e localStorage mockados.
 * Carrega em ordem: InputValidator → ApiService → Cliente → ClienteRepository → ClienteService.
 * ProfileRepository e AppointmentRepository são injetados como stubs
 * para isolar o domínio cliente dos outros repositórios.
 * @param {Function} fetchMock
 * @param {string|null} jwtToken
 * @param {object} [repoStubs] — stubs de ProfileRepository / AppointmentRepository
 */
function criarSandbox(fetchMock, jwtToken = null, repoStubs = {}) {
  const lsMock = {
    getItem: (k) =>
      k.includes('auth-token') && jwtToken
        ? JSON.stringify({ access_token: jwtToken })
        : null,
  };

  // Stubs padrão — sobrescritos por repoStubs quando necessário
  const ProfileRepositoryStub = repoStubs.ProfileRepository ?? {
    getFavorites: async () => [],
  };
  const AppointmentRepositoryStub = repoStubs.AppointmentRepository ?? {
    getByCliente: async () => [],
  };

  const sandbox = vm.createContext({
    console,
    localStorage:          lsMock,
    fetch:                 fetchMock,
    URLSearchParams,
    Error,
    TypeError,
    ProfileRepository:     ProfileRepositoryStub,
    AppointmentRepository: AppointmentRepositoryStub,
  });

  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/ApiService.js');
  carregar(sandbox, 'apps/cliente/assets/js/Cliente.js');
  carregar(sandbox, 'apps/cliente/assets/js/ClienteRepository.js');
  carregar(sandbox, 'apps/cliente/assets/js/ClienteService.js');
  return sandbox;
}

/** Resposta HTTP fake de sucesso */
function resOk(body) {
  return async () => ({
    ok:     true,
    status: 200,
    text:   async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json:   async () => body,
  });
}

/** Resposta HTTP fake de erro */
function resErro(status, body) {
  return async () => ({
    ok:     false,
    status,
    text:   async () => JSON.stringify(body),
    json:   async () => body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

suite('Cliente — model', () => {

  test('fromRow() cria instância com todos os campos mapeados', () => {
    const sb = criarSandbox(resOk({}));

    const row = {
      id:          UUID_CLIENTE,
      full_name:   'João Silva',
      phone:       '11999999999',
      avatar_path: 'avatars/joao.jpg',
      address:     'Rua A, 1',
      zip_code:    '01310100',
      birth_date:  '1990-05-15',
      gender:      'masculino',
      is_active:   true,
      created_at:  '2026-01-01T00:00:00Z',
    };

    const c = sb.Cliente.fromRow(row);

    assert.equal(c.id,          UUID_CLIENTE,           'id');
    assert.equal(c.nome,        'João Silva',            'nome');
    assert.equal(c.telefone,    '11999999999',           'telefone');
    assert.equal(c.avatarPath,  'avatars/joao.jpg',      'avatarPath');
    assert.equal(c.endereco,    'Rua A, 1',              'endereco');
    assert.equal(c.cep,         '01310100',              'cep');
    assert.equal(c.nascimento,  '1990-05-15',            'nascimento');
    assert.equal(c.genero,      'masculino',             'genero');
    assert.equal(c.criadoEm,    '2026-01-01T00:00:00Z', 'criadoEm');
    assert.equal(c.isAtivo(),   true,                    'isAtivo');
  });

  test('isAtivo() retorna false quando is_active=false', () => {
    const sb = criarSandbox(resOk({}));
    const c  = sb.Cliente.fromRow({ is_active: false });
    assert.equal(c.isAtivo(), false);
  });

  test('fromRow() aceita row vazio sem lançar erro', () => {
    const sb = criarSandbox(resOk({}));
    const c  = sb.Cliente.fromRow({});
    assert.equal(c.id,    null);
    assert.equal(c.nome,  '');
    assert.equal(c.isAtivo(), true); // padrão true quando ausente
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('ClienteRepository — getById()', () => {

  test('gera GET com eq role=client e eq id', async () => {
    let url;
    const row = { id: UUID_CLIENTE, full_name: 'João', role: 'client', is_active: true };
    const sb  = criarSandbox(async (u) => { url = u; return resOk(row)(); }, 'tok.en.jwt');

    await sb.ClienteRepository.getById(UUID_CLIENTE);

    const decoded = decodeURIComponent(url);
    assert.ok(url.includes('/rest/v1/profiles'),         'URL aponta para profiles');
    assert.ok(decoded.includes(`id=eq.${UUID_CLIENTE}`), 'filtro por id');
    assert.ok(decoded.includes('role=eq.client'),        'filtro role=client');
  });

  test('rejeita UUID inválido antes de chamar fetch', async () => {
    let chamado = false;
    const sb = criarSandbox(async () => { chamado = true; return resOk({})(); }, 'tok.en.jwt');

    await assert.rejects(
      () => sb.ClienteRepository.getById('nao-e-uuid'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('userId'), `mensagem: ${err.message}`);
        return true;
      },
    );
    assert.equal(chamado, false, 'fetch não deve ser chamado');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('ClienteRepository — update()', () => {

  test('envia PATCH apenas com campos da allowlist', async () => {
    let opts;
    const sb = criarSandbox(
      async (u, o) => { opts = o; return resOk([])(); },
      'tok.en.jwt',
    );

    await sb.ClienteRepository.update(UUID_CLIENTE, {
      full_name: 'João Atualizado',
      phone:     '11988887777',
    });

    const body = JSON.parse(opts.body);
    assert.equal(opts.method, 'PATCH');
    assert.equal(body.full_name, 'João Atualizado');
    assert.equal(body.phone,     '11988887777');
    assert.ok('updated_at' in body, 'updated_at obrigatório');
  });

  test('rejeita UUID inválido sem chamar fetch', async () => {
    let chamado = false;
    const sb = criarSandbox(async () => { chamado = true; return resOk([])(); }, 'tok.en.jwt');

    await assert.rejects(
      () => sb.ClienteRepository.update('invalido', { full_name: 'X' }),
      (err) => { assert.ok(err instanceof Error); return true; },
    );
    assert.equal(chamado, false);
  });

  test('descarta campo fora da allowlist (mass assignment)', async () => {
    let opts;
    const sb = criarSandbox(
      async (u, o) => { opts = o; return resOk([])(); },
      'tok.en.jwt',
    );

    await sb.ClienteRepository.update(UUID_CLIENTE, {
      full_name: 'OK',
      role:      'admin',   // campo proibido
      is_active: false,     // campo proibido
    });

    const body = JSON.parse(opts.body);
    assert.ok(!('role' in body),      'role deve ser descartado');
    assert.ok(!('is_active' in body), 'is_active deve ser descartado');
    assert.equal(body.full_name, 'OK');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('ClienteService', () => {

  test('carregarPerfil() retorna instância de Cliente', async () => {
    const row = { id: UUID_CLIENTE, full_name: 'Maria', is_active: true, role: 'client' };
    const sb  = criarSandbox(resOk(row), 'tok.en.jwt');

    const cliente = await sb.ClienteService.carregarPerfil(UUID_CLIENTE);

    assert.ok(cliente instanceof sb.Cliente, 'deve retornar instância de Cliente');
    assert.equal(cliente.id,   UUID_CLIENTE);
    assert.equal(cliente.nome, 'Maria');
  });

  test('carregarPerfil() usa cache na segunda chamada (fetch só 1×)', async () => {
    const row = { id: UUID_CLIENTE, full_name: 'Maria', is_active: true, role: 'client' };
    let contagem = 0;
    const sb = criarSandbox(async () => { contagem++; return resOk(row)(); }, 'tok.en.jwt');

    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);
    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);

    assert.equal(contagem, 1, 'fetch deve ser chamado apenas 1 vez');
  });

  test('atualizarPerfil() invalida cache após atualizar', async () => {
    const row = { id: UUID_CLIENTE, full_name: 'Maria', is_active: true, role: 'client' };
    let contagem = 0;
    const sb = criarSandbox(async () => { contagem++; return resOk(row)(); }, 'tok.en.jwt');

    // 1ª carga — guarda em cache
    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);
    // atualizar — invalida cache
    await sb.ClienteService.atualizarPerfil(UUID_CLIENTE, { full_name: 'Maria Nova' });
    // 2ª carga — deve buscar novamente
    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);

    assert.ok(contagem >= 2, `fetch deve ser chamado ao menos 2 vezes (foram ${contagem})`);
  });

  test('limparCache() força novo fetch na próxima chamada', async () => {
    const row = { id: UUID_CLIENTE, full_name: 'Maria', is_active: true, role: 'client' };
    let contagem = 0;
    const sb = criarSandbox(async () => { contagem++; return resOk(row)(); }, 'tok.en.jwt');

    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);
    sb.ClienteService.limparCache();
    await sb.ClienteService.carregarPerfil(UUID_CLIENTE);

    assert.equal(contagem, 2, 'fetch deve ser chamado 2 vezes após limparCache()');
  });

});
