'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

// ── Env vars — antes de carregar a aplicação ─────────────────────
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

const MensalistaRepository = require('../repositories/MensalistaRepository');
const MensalistaService    = require('../services/MensalistaService');

// ── UUIDs fixos ───────────────────────────────────────────────────
const SHOP_ID  = 'cccccccc-0000-4000-8000-000000000003';
const OWNER_ID = 'eeeeeeee-0000-4000-8000-000000000005';
const OTHER_ID = 'ffffffff-0000-4000-8000-000000000006';
const FAV_1    = '11111111-0000-4000-8000-000000000101';
const FAV_2    = '22222222-0000-4000-8000-000000000102';
const FAV_3    = '33333333-0000-4000-8000-000000000103';

const MOCK_SHOP_OWNER = { id: SHOP_ID, owner_id: OWNER_ID };

/**
 * Cria um mock de SupabaseClient com:
 *   - .rpc(nome, params) → favoritos retornados via RPC get_clientes_favoritos_barbearia
 *   - .from('barbershops').select().eq().maybeSingle() → owner check
 *   - .from('barbershop_mensalistas').select('client_id').eq().gt() → mensalistas ativos
 */
function criarDbMock({ shop = MOCK_SHOP_OWNER, favoritos = [], ativos = [] } = {}) {
  return {
    rpc: async (fn, _params) => {
      if (fn === 'get_clientes_favoritos_barbearia') {
        return { data: favoritos, error: null };
      }
      return { data: null, error: null };
    },
    from: (table) => {
      const q = {
        _select: null,
        select:      (s) => { q._select = s; return q; },
        eq:          ()  => q,
        gt:          ()  => q,
        order:       ()  => q,
        limit:       ()  => q,
        maybeSingle: () => {
          if (table === 'barbershops') return Promise.resolve({ data: shop, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => {
          if (table === 'barbershop_mensalistas') {
            return resolve({ data: ativos, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// SUITE — listarFavoritosElegiveis
// ═════════════════════════════════════════════════════════════════
suite('MensalistaService.listarFavoritosElegiveis', () => {

  test('owner válido + sem favoritos: retorna lista vazia', async () => {
    const db   = criarDbMock({ favoritos: [], ativos: [] });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    const lista = await svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID);
    assert.deepStrictEqual(lista, []);
  });

  test('owner válido + 3 favoritos + 0 ativos: retorna todos', async () => {
    const favoritos = [
      { id: FAV_1, full_name: 'Alice',  email: 'alice@x.com',  avatar_path: null, updated_at: null },
      { id: FAV_2, full_name: 'Bruno',  email: 'bruno@x.com',  avatar_path: null, updated_at: null },
      { id: FAV_3, full_name: 'Carlos', email: 'carlos@x.com', avatar_path: null, updated_at: null },
    ];
    const db   = criarDbMock({ favoritos, ativos: [] });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    const lista = await svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID);
    assert.strictEqual(lista.length, 3);
    assert.strictEqual(lista[0].full_name, 'Alice');
    assert.strictEqual(lista[2].full_name, 'Carlos');
  });

  test('exclui mensalistas ativos da lista de elegíveis', async () => {
    const favoritos = [
      { id: FAV_1, full_name: 'Alice',  email: null, avatar_path: null, updated_at: null },
      { id: FAV_2, full_name: 'Bruno',  email: null, avatar_path: null, updated_at: null },
      { id: FAV_3, full_name: 'Carlos', email: null, avatar_path: null, updated_at: null },
    ];
    const ativos = [{ client_id: FAV_2 }]; // Bruno já é mensalista
    const db    = criarDbMock({ favoritos, ativos });
    const repo  = new MensalistaRepository(db);
    const svc   = new MensalistaService(repo, db);

    const lista = await svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID);
    assert.strictEqual(lista.length, 2);
    assert.deepStrictEqual(lista.map(p => p.id), [FAV_1, FAV_3]);
  });

  test('normaliza nulls em full_name para "Cliente"', async () => {
    const favoritos = [{ id: FAV_1, full_name: null, email: null, avatar_path: null, updated_at: null }];
    const db    = criarDbMock({ favoritos, ativos: [] });
    const repo  = new MensalistaRepository(db);
    const svc   = new MensalistaService(repo, db);

    const lista = await svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID);
    assert.strictEqual(lista[0].full_name, 'Cliente');
  });

  test('não-owner: lança AppError 403', async () => {
    const db    = criarDbMock({ shop: { id: SHOP_ID, owner_id: OTHER_ID } });
    const repo  = new MensalistaRepository(db);
    const svc   = new MensalistaService(repo, db);

    await assert.rejects(
      () => svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID),
      (err) => { assert.strictEqual(err.status, 403); return true; },
    );
  });

  test('barbearia inexistente: lança AppError 403', async () => {
    const db    = criarDbMock({ shop: null });
    const repo  = new MensalistaRepository(db);
    const svc   = new MensalistaService(repo, db);

    await assert.rejects(
      () => svc.listarFavoritosElegiveis(OWNER_ID, SHOP_ID),
      (err) => { assert.strictEqual(err.status, 403); return true; },
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// SUITE — buscarClientesDisponiveis (hardening: exige q não vazio)
// ═════════════════════════════════════════════════════════════════
suite('MensalistaRepository.buscarClientesDisponiveis — hardening', () => {

  test('q vazia: retorna [] sem consultar profiles', async () => {
    let consultouProfiles = false;
    const db = {
      from: (table) => {
        if (table === 'profiles') consultouProfiles = true;
        const q = {
          select: () => q, eq: () => q, gt: () => q, ilike: () => q,
          not: () => q, limit: () => q, order: () => q,
          then: (r) => r({ data: [], error: null }),
        };
        return q;
      },
    };
    const repo = new MensalistaRepository(db);
    const lista = await repo.buscarClientesDisponiveis(SHOP_ID, '');
    assert.deepStrictEqual(lista, []);
    assert.strictEqual(consultouProfiles, false, 'profiles não pode ser consultado com q vazia');
  });

  test('q "   " (só espaços): retorna [] sem consultar profiles', async () => {
    let consultouProfiles = false;
    const db = {
      from: (table) => {
        if (table === 'profiles') consultouProfiles = true;
        const q = {
          select: () => q, eq: () => q, gt: () => q, ilike: () => q,
          not: () => q, limit: () => q, order: () => q,
          then: (r) => r({ data: [], error: null }),
        };
        return q;
      },
    };
    const repo = new MensalistaRepository(db);
    const lista = await repo.buscarClientesDisponiveis(SHOP_ID, '   ');
    assert.deepStrictEqual(lista, []);
    assert.strictEqual(consultouProfiles, false);
  });
});
