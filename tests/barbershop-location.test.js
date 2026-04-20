'use strict';

// =============================================================
// barbershop-location.test.js
//
// Testa:
//   1. BarbershopRepository.updateLocation  — persiste coords no banco
//   2. BarbershopService.salvarLocalizacaoGPS — GPS → banco
//   3. BarbershopService.geocodificarCep     — ViaCEP → endereço
//   4. BarbershopService.salvarLocalizacaoCep — CEP → geocode → banco
// =============================================================

const { suite, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

// UUIDs válidos (RFC-4122) para uso nos mocks
const UUID_OWNER = '550e8400-e29b-41d4-a716-446655440001';
const UUID_SHOP  = '550e8400-e29b-41d4-a716-446655440002';

// ─────────────────────────────────────────────────────────────
// FÁBRICAS
// ─────────────────────────────────────────────────────────────

/**
 * Cria instância do BarbershopRepository com mock do Supabase.
 * @param {{ data?, error? }} result — resposta simulada do banco
 */
function criarRepo({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = (() => {
    const b = {
      select:  fn(), eq: fn(), update: fn(), single: fn(),
      insert:  fn(), order: fn(), limit: fn(), gte: fn(), lte: fn(), or: fn(),
    };
    // Cada método retorna o próprio builder (fluent)
    ['select','eq','update','order','limit','gte','lte','or','insert'].forEach(m => {
      b[m].mockReturnValue(b);
    });
    b.single.mockResolvedValue(result);
    // Resolução final do builder como Promise (para .eq().eq()... final)
    b[Symbol.toPrimitive] = () => result;
    // Faz o builder resolver como promise quando awaited
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return b;
  })();

  const supabaseMock = { barbershops: fn(() => builder) };
  const sandbox = vm.createContext({ console, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/BarbershopRepository.js');

  return { BarbershopRepository: sandbox.BarbershopRepository, builder, supabaseMock };
}

/**
 * Cria instância do BarbershopService com mocks do repositório e do fetch.
 */
function criarServico({ repoUpdateOk = true, fetchResult = null } = {}) {
  const repoMock = {
    updateLocation: fn().mockResolvedValue(repoUpdateOk ? { id: 'shop-1' } : null),
    getAll: fn().mockResolvedValue([]),
    getFeatured: fn().mockResolvedValue([]),
    getBarbers: fn().mockResolvedValue([]),
    getNearby: fn().mockResolvedValue([]),
    search: fn().mockResolvedValue([]),
  };

  const geoMock = { verificarPermissao: fn().mockResolvedValue('granted'), obter: fn() };

  const fetchMock = fn().mockResolvedValue({
    ok: fetchResult !== null,
    json: fn().mockResolvedValue(fetchResult ?? {}),
  });

  const sandbox = vm.createContext({
    console,
    BarbershopRepository: repoMock,
    GeoService:           geoMock,
    fetch:                fetchMock,
    LoggerService:        { warn: fn(), error: fn(), info: fn() },
  });
  carregar(sandbox, 'shared/js/BarbershopService.js');

  return { BarbershopService: sandbox.BarbershopService, repoMock, geoMock, fetchMock };
}

// ─────────────────────────────────────────────────────────────
// SUITE 1: BarbershopRepository.updateLocation
// ─────────────────────────────────────────────────────────────

suite('BarbershopRepository.updateLocation', () => {

  test('chama .update com lat/lng e retorna dado do banco', async () => {
    const shopData = {
      id: UUID_SHOP, owner_id: UUID_OWNER,
      latitude: -23.55, longitude: -46.63,
      address: 'Rua Teste, 100', city: 'São Paulo', state: 'SP', zip_code: '01310-100',
    };
    const { BarbershopRepository, builder, supabaseMock } = criarRepo({ data: shopData });

    // Prepara o builder de update: .eq().single() resolve o shopData
    builder.update.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.single.mockResolvedValue({ data: shopData, error: null });

    const result = await BarbershopRepository.updateLocation(
      UUID_OWNER, -23.55, -46.63, 'Rua Teste, 100', 'São Paulo', 'SP', '01310-100'
    );

    assert.ok(supabaseMock.barbershops.calls.length >= 1, 'deve chamar SupabaseService.barbershops()');
    assert.ok(builder.update.calls.length >= 1, 'deve chamar .update()');
    assert.deepEqual(result, shopData);
  });

  test('lança erro se owner_id for inválido (uuid vazio)', async () => {
    const { BarbershopRepository } = criarRepo();
    await assert.rejects(
      () => BarbershopRepository.updateLocation('', -23.55, -46.63),
      /owner_id|inválido|uuid/i
    );
  });

  test('lança erro se coordenadas forem inválidas', async () => {
    const { BarbershopRepository } = criarRepo();
    await assert.rejects(
      () => BarbershopRepository.updateLocation(UUID_OWNER, 999, -46.63),
      /coordena|inválid/i
    );
  });

  test('lança erro se banco retorna error', async () => {
    const dbError = { message: 'permission denied', code: '42501' };
    const { BarbershopRepository, builder } = criarRepo({ error: dbError });
    builder.update.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.single.mockResolvedValue({ data: null, error: dbError });

    await assert.rejects(
      () => BarbershopRepository.updateLocation(UUID_OWNER, -23.55, -46.63),
      /permission|42501/i
    );
  });
});

// ─────────────────────────────────────────────────────────────
// SUITE 2: BarbershopService.salvarLocalizacaoGPS
// ─────────────────────────────────────────────────────────────

suite('BarbershopService.salvarLocalizacaoGPS', () => {

  test('chama updateLocation com coords do GPS e retorna resultado', async () => {
    const { BarbershopService, repoMock } = criarServico();

    const res = await BarbershopService.salvarLocalizacaoGPS(UUID_OWNER, -23.55, -46.63);

    assert.ok(repoMock.updateLocation.calls.length === 1, 'deve chamar updateLocation uma vez');
    const [ownerId, lat, lng] = repoMock.updateLocation.calls[0];
    assert.equal(ownerId, UUID_OWNER);
    assert.equal(lat, -23.55);
    assert.equal(lng, -46.63);
  });

  test('lança erro se ownerId estiver vazio', async () => {
    const { BarbershopService } = criarServico();
    await assert.rejects(
      () => BarbershopService.salvarLocalizacaoGPS('', -23.55, -46.63),
      /owner|id|inválido/i
    );
  });

  test('lança erro se coordenadas forem inválidas (NaN)', async () => {
    const { BarbershopService } = criarServico();
    await assert.rejects(
      () => BarbershopService.salvarLocalizacaoGPS('owner-1', NaN, -46.63),
      /coordena|inválid/i
    );
  });
});

// ─────────────────────────────────────────────────────────────
// SUITE 3: BarbershopService.geocodificarCep
// ─────────────────────────────────────────────────────────────

suite('BarbershopService.geocodificarCep', () => {

  test('retorna endereço formatado a partir de resposta válida do ViaCEP', async () => {
    const viaCepResposta = {
      logradouro: 'Avenida Paulista',
      bairro:     'Bela Vista',
      localidade: 'São Paulo',
      uf:         'SP',
      cep:        '01310-100',
      erro:       undefined,
    };
    const { BarbershopService, fetchMock } = criarServico({ fetchResult: viaCepResposta });
    fetchMock.mockResolvedValue({ ok: true, json: fn().mockResolvedValue(viaCepResposta) });

    const result = await BarbershopService.geocodificarCep('01310100');

    assert.ok(fetchMock.calls.length === 1, 'deve chamar fetch uma vez');
    assert.ok(fetchMock.calls[0][0].includes('01310100'), 'URL deve conter o CEP sem traço');
    assert.equal(result.city,     'São Paulo');
    assert.equal(result.state,    'SP');
    assert.equal(result.zip_code, '01310-100');
    assert.ok(result.address.includes('Avenida Paulista'));
  });

  test('lança erro se ViaCEP retornar { erro: true }', async () => {
    const { BarbershopService, fetchMock } = criarServico();
    fetchMock.mockResolvedValue({ ok: true, json: fn().mockResolvedValue({ erro: true }) });

    await assert.rejects(
      () => BarbershopService.geocodificarCep('99999999'),
      /CEP|não encontrado|inválido/i
    );
  });

  test('lança erro se o CEP tiver formato inválido', async () => {
    const { BarbershopService } = criarServico();
    await assert.rejects(
      () => BarbershopService.geocodificarCep('123'),
      /CEP|formato|inválido/i
    );
  });

  test('lança erro se fetch falhar (rede offline)', async () => {
    const { BarbershopService, fetchMock } = criarServico();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await assert.rejects(
      () => BarbershopService.geocodificarCep('01310100'),
      /fetch|rede|serviço/i
    );
  });
});

// ─────────────────────────────────────────────────────────────
// SUITE 4: BarbershopService.salvarLocalizacaoCep
// ─────────────────────────────────────────────────────────────

suite('BarbershopService.salvarLocalizacaoCep', () => {

  test('fluxo completo: CEP → endereço → coords → banco', async () => {
    const viaCepResposta = {
      logradouro: 'Av Paulista', bairro: 'Bela Vista',
      localidade: 'São Paulo', uf: 'SP', cep: '01310-100',
    };
    const nominatimResposta = [{ lat: '-23.5629', lon: '-46.6544' }];

    // fetch retorna ViaCEP na 1ª chamada, Nominatim na 2ª
    let fetchCall = 0;
    const fetchMock = fn().mockImplementation(() => {
      fetchCall++;
      const body = fetchCall === 1 ? viaCepResposta : nominatimResposta;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });

    const repoMock = { updateLocation: fn().mockResolvedValue({ id: UUID_SHOP }) };
    const sandbox = vm.createContext({
      console,
      BarbershopRepository: repoMock,
      GeoService: { verificarPermissao: fn(), obter: fn() },
      fetch: fetchMock,
      LoggerService: { warn: fn(), error: fn(), info: fn() },
    });
    carregar(sandbox, 'shared/js/BarbershopService.js');
    const { BarbershopService } = sandbox;

    const res = await BarbershopService.salvarLocalizacaoCep(UUID_OWNER, '01310100');

    assert.equal(fetchMock.calls.length, 2, 'deve fazer 2 chamadas fetch (ViaCEP + Nominatim)');
    assert.ok(repoMock.updateLocation.calls.length === 1, 'deve salvar no banco uma vez');

    const [ownerId, lat, lng, address, city, state, zip] = repoMock.updateLocation.calls[0];
    assert.equal(ownerId, UUID_OWNER);
    assert.ok(Math.abs(lat - (-23.5629)) < 0.001, 'lat deve vir do Nominatim');
    assert.ok(Math.abs(lng - (-46.6544)) < 0.001, 'lng deve vir do Nominatim');
    assert.equal(city,  'São Paulo');
    assert.equal(state, 'SP');
    assert.equal(zip,   '01310-100');
  });

  test('lança erro se Nominatim não encontrar coords', async () => {
    const viaCepResposta = {
      logradouro: 'Rua X', localidade: 'Cidade Y', uf: 'ZZ', cep: '12345-678',
    };
    let fetchCall = 0;
    const fetchMock = fn().mockImplementation(() => {
      fetchCall++;
      const body = fetchCall === 1 ? viaCepResposta : []; // Nominatim vazio
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });

    const sandbox = vm.createContext({
      console,
      BarbershopRepository: { updateLocation: fn() },
      GeoService: { verificarPermissao: fn(), obter: fn() },
      fetch: fetchMock,
      LoggerService: { warn: fn(), error: fn(), info: fn() },
    });
    carregar(sandbox, 'shared/js/BarbershopService.js');

    await assert.rejects(
      () => sandbox.BarbershopService.salvarLocalizacaoCep(UUID_OWNER, '12345678'),
      /endereço|coordena|não encontrad/i
    );
  });
});
