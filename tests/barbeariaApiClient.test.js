'use strict';

// =============================================================
// barbeariaApiClient.test.js — contrato do BarbeariaApiClient.
//
// Contrato vigente (commit 5f0ab229): BarbershopRepository
// (Supabase direto) é a fonte PRIMÁRIA — elimina CORS via CDN
// para dados públicos. BffApiService é o FALLBACK quando o
// Supabase falha. Aviso de indisponibilidade só quando ambos
// falham.
// =============================================================

const { describe, test } = require('node:test');
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

describe('BarbeariaApiClient — getNearby', () => {
  test('Supabase ok → retorna dados do Repository; BFF não chamada', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();
    mockNearby.mockResolvedValue(BARBEARIAS_SUPABASE);

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.deepEqual(result, BARBEARIAS_SUPABASE);
    assert.equal(mockBffGet.calls.length, 0, 'BFF não deve ser chamada quando Supabase responde');
  });

  test('Supabase falha → fallback para BFF com dados', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();
    mockNearby.mockRejectedValue(new Error('Supabase indisponível'));
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockNearby.calls.length, 1, 'Repository é a fonte primária');
    assert.equal(mockBffGet.calls.length, 1, 'BFF deve ser o fallback');
  });

  test('Supabase e BFF falham → retorna [] e loga aviso de indisponibilidade', async () => {
    const { sandbox, mockBffGet, mockNearby, warns } = criarSandbox();
    mockNearby.mockRejectedValue(new Error('Supabase down'));
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de indisponibilidade',
    );
  });

  test('coords inválidas (NaN) → lança TypeError antes de qualquer chamada de rede', async () => {
    const { sandbox, mockBffGet, mockNearby } = criarSandbox();

    await assert.rejects(
      () => sandbox.BarbeariaApiClient.getNearby(NaN, LNG, RAIO),
      TypeError,
    );
    assert.equal(mockBffGet.calls.length, 0);
    assert.equal(mockNearby.calls.length, 0);
  });

  test('chamadas repetidas com mesmos parâmetros reutilizam cache e não repetem a fonte', async () => {
    const { sandbox, mockNearby } = criarSandbox();
    mockNearby.mockResolvedValue(BARBEARIAS_SUPABASE);

    const primeira = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);
    const segunda  = await sandbox.BarbeariaApiClient.getNearby(LAT, LNG, RAIO);

    assert.deepEqual(primeira, BARBEARIAS_SUPABASE);
    assert.deepEqual(segunda, BARBEARIAS_SUPABASE);
    assert.equal(mockNearby.calls.length, 1, 'fonte deve ser consultada uma vez por chave');
  });
});

// ─── Suíte: getDestaque ──────────────────────────────────────────────────────

describe('BarbeariaApiClient — getDestaque', () => {
  test('Supabase ok → retorna dados do Repository; BFF não chamada', async () => {
    const { sandbox, mockBffGet, mockFeatured } = criarSandbox();
    mockFeatured.mockResolvedValue(BARBEARIAS_SUPABASE);

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.deepEqual(result, BARBEARIAS_SUPABASE);
    assert.equal(mockBffGet.calls.length, 0);
  });

  test('Supabase falha → fallback para BFF com dados', async () => {
    const { sandbox, mockBffGet, mockFeatured } = criarSandbox();
    mockFeatured.mockRejectedValue(new Error('Supabase down'));
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockFeatured.calls.length, 1);
    assert.equal(mockBffGet.calls.length, 1);
  });

  test('Supabase e BFF falham → retorna [] e loga aviso de indisponibilidade', async () => {
    const { sandbox, mockBffGet, mockFeatured, warns } = criarSandbox();
    mockFeatured.mockRejectedValue(new Error('Supabase down'));
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getDestaque(6);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de indisponibilidade',
    );
  });

  test('chamadas concorrentes de destaque compartilham a mesma request', async () => {
    const { sandbox, mockFeatured } = criarSandbox();
    mockFeatured.mockImplementation(async () => {
      await new Promise(resolve => setImmediate(resolve));
      return BARBEARIAS_SUPABASE;
    });

    const [primeira, segunda] = await Promise.all([
      sandbox.BarbeariaApiClient.getDestaque(6),
      sandbox.BarbeariaApiClient.getDestaque(6),
    ]);

    assert.deepEqual(primeira, BARBEARIAS_SUPABASE);
    assert.deepEqual(segunda, BARBEARIAS_SUPABASE);
    assert.equal(mockFeatured.calls.length, 1, 'requests concorrentes devem ser coalescidas');
  });
});

// ─── Suíte: getTodas ─────────────────────────────────────────────────────────

describe('BarbeariaApiClient — getTodas', () => {
  test('Supabase ok → retorna dados do Repository; BFF não chamada', async () => {
    const { sandbox, mockBffGet, mockGetAll } = criarSandbox();
    mockGetAll.mockResolvedValue(BARBEARIAS_SUPABASE);

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.deepEqual(result, BARBEARIAS_SUPABASE);
    assert.equal(mockBffGet.calls.length, 0);
  });

  test('Supabase falha → fallback para BFF com dados', async () => {
    const { sandbox, mockBffGet, mockGetAll } = criarSandbox();
    mockGetAll.mockRejectedValue(new Error('Supabase down'));
    mockBffGet.mockResolvedValue({ data: BARBEARIAS_BFF, total: 2, error: null });

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.deepEqual(result, BARBEARIAS_BFF);
    assert.equal(mockGetAll.calls.length, 1);
    assert.equal(mockBffGet.calls.length, 1);
  });

  test('Supabase e BFF falham → retorna [] e loga aviso de indisponibilidade', async () => {
    const { sandbox, mockBffGet, mockGetAll, warns } = criarSandbox();
    mockGetAll.mockRejectedValue(new Error('Supabase down'));
    mockBffGet.mockResolvedValue({ data: null, total: null, error: new Error('BFF down') });

    const result = await sandbox.BarbeariaApiClient.getTodas(60);

    assert.ok(Array.isArray(result) && result.length === 0, 'deve retornar array vazio');
    assert.ok(
      warns.some(a => a[0].includes('BFF indisponível')),
      'deve logar aviso de indisponibilidade',
    );
  });

  test('chamadas repetidas de todas reutilizam cache por limit', async () => {
    const { sandbox, mockGetAll } = criarSandbox();
    mockGetAll.mockResolvedValue(BARBEARIAS_SUPABASE);

    await sandbox.BarbeariaApiClient.getTodas(20);
    await sandbox.BarbeariaApiClient.getTodas(20);
    await sandbox.BarbeariaApiClient.getTodas(60);

    assert.equal(mockGetAll.calls.length, 2, 'limits diferentes devem ter chaves separadas');
  });

  test('invalidarCache limpa lista antiga para recarregar mapa apos salvar GPS', async () => {
    const { sandbox, mockGetAll } = criarSandbox();
    const listaAtualizada = [
      { id: '9', name: 'Barbearia Nova', latitude: LAT, longitude: LNG },
    ];
    let chamada = 0;
    mockGetAll.mockImplementation(async () => {
      chamada += 1;
      return chamada === 1 ? [] : listaAtualizada;
    });

    const primeira = await sandbox.BarbeariaApiClient.getTodas(100);
    sandbox.BarbeariaApiClient.invalidarCache();
    const segunda = await sandbox.BarbeariaApiClient.getTodas(100);

    assert.deepEqual(primeira, []);
    assert.deepEqual(segunda, listaAtualizada);
    assert.equal(mockGetAll.calls.length, 2, 'deve consultar a fonte novamente apos invalidar cache');
  });
});
