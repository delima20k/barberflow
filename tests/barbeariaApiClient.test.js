'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── Fixtures ───────────────────────────────────────────────────────────────

const LAT  = -23.4516;
const LNG  = -46.7460;
const RAIO = 5;

const BARBEARIAS_BFF = [
  { id: '1', name: 'Barbearia A', latitude: LAT, longitude: LNG },
  { id: '2', name: 'Barbearia B', latitude: LAT, longitude: LNG },
];

const BARBEARIAS_SUPABASE = [
  { id: '3', name: 'Barbearia C (Supabase)', latitude: LAT, longitude: LNG },
];

// ─── Fábrica de sandbox ─────────────────────────────────────────────────────

function criarSandbox() {
  const mockBffGet   = fn();
  const mockNearby   = fn();
  const mockFeatured = fn();
  const mockGetAll   = fn();
  const warns        = [];

  const sandbox = vm.createContext({
    console,
    Error,
    TypeError,
    isFinite: global.isFinite,
    BffApiService: {
      get: mockBffGet,
    },
    BarbershopRepository: {
      getNearby:   mockNearby,
      getFeatured: mockFeatured,
      getAll:      mockGetAll,
    },
    LoggerService: {
      warn:  (...args) => warns.push(args),
      error: () => {},
    },
  });

  carregar(sandbox, 'shared/js/BarbeariaApiClient.js');

  return { sandbox, mockBffGet, mockNearby, mockFeatured, mockGetAll, warns };
}

// ─── Suíte: getNearby ────────────────────────────────────────────────────────

suite('BarbeariaApiClient — getNearby', () => {
  test('BFF ok → retorna dados do BFF; BarbershopRepository não chamado', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockNearby.calls.length, 0);
  });

  test('BFF falha → retorna [] sem acionar BarbershopRepository', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF indisponível') });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.equal(mockNearby.calls.length, 0, 'BarbershopRepository não deve ser chamado');
  });

  test('BFF falha + erro de rede → retorna [] sem acionar BarbershopRepository', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('timeout') });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.equal(mockNearby.calls.length, 0, 'BarbershopRepository não deve ser chamado');
  });

  test('BFF falha → retorna [] e loga aviso de BFF indisponível', async () => {
    const { sandbox, mockBffGet, mockNearby, warns } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de BFF indisponível',
    );
    assert.equal(mockNearby.calls.length, 0, 'BarbershopRepository não deve ser chamado');
  });

  test('coords inválidas (NaN) → lança TypeError antes de qualquer chamada de rede', async () => {
    const { sandbox, mockBffGet } = criarSandbox();

    await assert.rejects(
      () => sandbox.BarbeariaApiClient.getNearby(NaN, LNG, RAIO),
      TypeError,
    );
    assert.equal(mockBffGet.calls.length, 0);
  });
});

// ─── Suíte: getDestaque ──────────────────────────────────────────────────────

suite('BarbeariaApiClient — getDestaque', () => {
  test('BFF ok → retorna dados do BFF; getFeatured não chamado', async () => {
    const { sandbox, mockBffGet, mockFeatured } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockFeatured.calls.length, 0);
  });

  test('BFF falha → retorna [] sem acionar BarbershopRepository.getFeatured', async () => {
    const { sandbox, mockBffGet, mockFeatured } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.equal(mockFeatured.calls.length, 0, 'BarbershopRepository.getFeatured não deve ser chamado');
  });

  test('BFF falha → retorna [] e loga aviso de BFF indisponível', async () => {
    const { sandbox, mockBffGet, mockFeatured, warns } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de BFF indisponível',
    );
    assert.equal(mockFeatured.calls.length, 0, 'BarbershopRepository não deve ser chamado');
  });
});

// ─── Suíte: getTodas ─────────────────────────────────────────────────────────

suite('BarbeariaApiClient — getTodas', () => {
  test('BFF ok → retorna dados do BFF; getAll não chamado', async () => {
    const { sandbox, mockBffGet, mockGetAll } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockGetAll.calls.length, 0);
  });

  test('BFF falha → retorna [] sem acionar BarbershopRepository.getAll', async () => {
    const { sandbox, mockBffGet, mockGetAll } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.equal(mockGetAll.calls.length, 0, 'BarbershopRepository.getAll não deve ser chamado');
  });

  test('BFF falha → retorna [] e loga aviso de BFF indisponível', async () => {
    const { sandbox, mockBffGet, mockGetAll, warns } = criarSandbox();
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de BFF indisponível',
    );
    assert.equal(mockGetAll.calls.length, 0, 'BarbershopRepository não deve ser chamado');
  });
});
