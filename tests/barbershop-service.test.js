'use strict';
/**
 * tests/barbershop-service.test.js
 *
 * Testa BarbershopService: carregarFavoritos, isFavorito, ausência de usuário.
 * Métodos que dependem de DOM (criarBotaoFavoritoCard) não são testáveis em VM.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_USER = 'u0000000-0000-4000-8000-000000000001';
const UUID_BS1  = 'b0000000-0000-4000-8000-000000000001';
const UUID_BS2  = 'b0000000-0000-4000-8000-000000000002';

function criarSandbox({ userId = UUID_USER, favIds = [] } = {}) {
  const SupabaseService = {
    getUser: fn().mockResolvedValue(userId ? { id: userId } : null),
  };
  const ProfileRepository = {
    getFavorites: fn().mockResolvedValue(favIds.map(id => ({ id }))),
  };
  const LoggerService = { warn: fn(), info: fn(), error: fn() };

  const sb = vm.createContext({
    console, Error, TypeError, Promise,
    SupabaseService, ProfileRepository, LoggerService,
  });
  carregar(sb, 'shared/js/BarbershopService.js');
  return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
// BarbershopService.carregarFavoritos()
// ─────────────────────────────────────────────────────────────────────────────
suite('BarbershopService.carregarFavoritos()', () => {

  test('popula cache com IDs retornados pelo ProfileRepository', async () => {
    const sb = criarSandbox({ favIds: [UUID_BS1, UUID_BS2] });
    await sb.BarbershopService.carregarFavoritos();
    assert.strictEqual(sb.BarbershopService.isFavorito(UUID_BS1), true);
    assert.strictEqual(sb.BarbershopService.isFavorito(UUID_BS2), true);
  });

  test('IDs ausentes retornam isFavorito false', async () => {
    const sb = criarSandbox({ favIds: [UUID_BS1] });
    await sb.BarbershopService.carregarFavoritos();
    assert.strictEqual(sb.BarbershopService.isFavorito(UUID_BS2), false);
  });

  test('retorna Set vazio quando usuário não está logado', async () => {
    const SupabaseService   = { getUser: fn().mockResolvedValue(null) };
    const ProfileRepository = { getFavorites: fn() };
    const sb = vm.createContext({
      console, Error, TypeError, Promise,
      SupabaseService, ProfileRepository,
      LoggerService: { warn: fn() },
    });
    carregar(sb, 'shared/js/BarbershopService.js');

    await sb.BarbershopService.carregarFavoritos();
    // getFavorites não deve ter sido chamado
    assert.strictEqual(ProfileRepository.getFavorites.calls.length, 0);
  });

  test('segunda chamada usa cache sem chamar ProfileRepository novamente', async () => {
    const sb = criarSandbox({ favIds: [UUID_BS1] });
    await sb.BarbershopService.carregarFavoritos();
    await sb.BarbershopService.carregarFavoritos();
    assert.strictEqual(sb.ProfileRepository.getFavorites.calls.length, 1);
  });

  test('force=true recarrega do servidor', async () => {
    const sb = criarSandbox({ favIds: [UUID_BS1] });
    await sb.BarbershopService.carregarFavoritos();
    await sb.BarbershopService.carregarFavoritos(true);
    assert.ok(sb.ProfileRepository.getFavorites.calls.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BarbershopService.isFavorito()
// ─────────────────────────────────────────────────────────────────────────────
suite('BarbershopService.isFavorito()', () => {

  test('retorna false sem carregar favoritos', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.BarbershopService.isFavorito(UUID_BS1), false);
  });

  test('isFavorito(null) retorna false sem lançar', () => {
    const sb = criarSandbox();
    assert.doesNotThrow(() => sb.BarbershopService.isFavorito(null));
    assert.strictEqual(sb.BarbershopService.isFavorito(null), false);
  });
});
