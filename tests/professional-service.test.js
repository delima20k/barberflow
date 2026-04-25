'use strict';
/**
 * tests/professional-service.test.js
 *
 * Testa ProfessionalService: carregarInteracoes, isFavorito, isCurtido,
 * getStarsFromLikes.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_USER = 'u0000000-0000-4000-8000-000000000001';
const UUID_PRO1 = 'p0000000-0000-4000-8000-000000000001';
const UUID_PRO2 = 'p0000000-0000-4000-8000-000000000002';

function criarSandbox({ userId = UUID_USER, favIds = [], likeIds = [] } = {}) {
  const SupabaseService = {
    getUser: fn().mockResolvedValue({ id: userId }),
  };
  const ProfileRepository = {
    getUserProfessionalFavs:   fn().mockResolvedValue(new Set(favIds)),
    getUserProfessionalLikes:  fn().mockResolvedValue(new Set(likeIds)),
  };
  const LoggerService = { warn: fn(), info: fn(), error: fn() };

  const sb = vm.createContext({
    console, Error, TypeError, Promise,
    SupabaseService, ProfileRepository, LoggerService,
  });
  carregar(sb, 'shared/js/ProfessionalService.js');
  return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfessionalService.carregarInteracoes()
// ─────────────────────────────────────────────────────────────────────────────
suite('ProfessionalService.carregarInteracoes()', () => {

  test('retorna Sets de favs e likes após carregamento', async () => {
    const sb = criarSandbox({ favIds: [UUID_PRO1], likeIds: [UUID_PRO2] });
    const { favs, likes } = await sb.ProfessionalService.carregarInteracoes();
    assert.strictEqual(typeof favs.has,  'function', 'favs deve ser Set-like');
    assert.strictEqual(typeof likes.has, 'function', 'likes deve ser Set-like');
  });

  test('segunda chamada usa cache (não aciona ProfileRepository de novo)', async () => {
    const sb = criarSandbox({ favIds: [UUID_PRO1] });
    await sb.ProfessionalService.carregarInteracoes();
    await sb.ProfessionalService.carregarInteracoes();
    // getUserProfessionalFavs deve ter sido chamado apenas 1 vez
    assert.strictEqual(sb.ProfileRepository.getUserProfessionalFavs.calls.length, 1);
  });

  test('force=true recarrega do ProfileRepository', async () => {
    const sb = criarSandbox({ favIds: [UUID_PRO1] });
    await sb.ProfessionalService.carregarInteracoes();
    await sb.ProfessionalService.carregarInteracoes(true);
    assert.ok(sb.ProfileRepository.getUserProfessionalFavs.calls.length >= 2);
  });

  test('retorna Sets vazios quando usuário não está logado', async () => {
    const SupabaseService   = { getUser: fn().mockResolvedValue(null) };
    const ProfileRepository = {
      getUserProfessionalFavs:  fn().mockResolvedValue(new Set()),
      getUserProfessionalLikes: fn().mockResolvedValue(new Set()),
    };
    const sb = vm.createContext({
      console, Error, TypeError, Promise,
      SupabaseService, ProfileRepository,
      LoggerService: { warn: fn() },
    });
    carregar(sb, 'shared/js/ProfessionalService.js');

    const { favs, likes } = await sb.ProfessionalService.carregarInteracoes();
    assert.strictEqual(typeof favs.has, 'function');
    assert.strictEqual(typeof likes.has, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfessionalService.isFavorito() / isCurtido()
// ─────────────────────────────────────────────────────────────────────────────
suite('ProfessionalService.isFavorito() e isCurtido()', () => {

  test('isFavorito() retorna true para ID no cache', async () => {
    const sb = criarSandbox({ favIds: [UUID_PRO1] });
    await sb.ProfessionalService.carregarInteracoes();
    assert.strictEqual(sb.ProfessionalService.isFavorito(UUID_PRO1), true);
  });

  test('isFavorito() retorna false para ID ausente', async () => {
    const sb = criarSandbox({ favIds: [] });
    await sb.ProfessionalService.carregarInteracoes();
    assert.strictEqual(sb.ProfessionalService.isFavorito(UUID_PRO1), false);
  });

  test('isCurtido() retorna true para ID no cache', async () => {
    const sb = criarSandbox({ likeIds: [UUID_PRO2] });
    await sb.ProfessionalService.carregarInteracoes();
    assert.strictEqual(sb.ProfessionalService.isCurtido(UUID_PRO2), true);
  });

  test('isFavorito(null) retorna false sem lançar', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.isFavorito(null), false);
    assert.strictEqual(sb.ProfessionalService.isFavorito(''), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfessionalService.estrelasPorCurtidas()
// ─────────────────────────────────────────────────────────────────────────────
suite('ProfessionalService.estrelasPorCurtidas()', () => {

  test('0 curtidas → 0', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(0), 0);
  });

  test('1 curtida → 3.3 (prior Bayesiano)', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(1), 3.3);
  });

  test('5 curtidas → 4.0', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(5), 4.0);
  });

  test('15 curtidas → 4.5', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(15), 4.5);
  });

  test('40 curtidas → 4.8', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(40), 4.8);
  });

  test('100 curtidas → 4.9', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.ProfessionalService.estrelasPorCurtidas(100), 4.9);
  });
});
