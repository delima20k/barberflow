'use strict';

/**
 * Testes unitários de BarbeariaRepository.getNearby()
 *
 * Objetivo: garantir que:
 *   1. Quando o RPC (PostGIS) retorna dados com sucesso, o resultado do RPC é usado
 *   2. Quando o RPC falha (seja por função inexistente ou erro genérico),
 *      o fallback bounding-box é acionado e a resposta é 200/array
 *   3. Quando RPC E fallback falham, AppError(500) é lançado
 *   4. Coordenadas inválidas resultam em AppError(400), nunca chegando ao banco
 */

// ── Configura env antes de qualquer require BFF ──────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaRepository = require('../repositories/BarbeariaRepository');

// ── Fábrica de mock de cliente Supabase ──────────────────────────
/**
 * Cria um mock mínimo do cliente Supabase com comportamento configurável.
 *
 * @param {{
 *   rpcData?:   object[],
 *   rpcError?:  object,
 *   fromData?:  object[],
 *   fromError?: object,
 * }} opts
 */
function criarMockDb({ rpcData, rpcError, fromData, fromError } = {}) {
  const qb = () => {
    const q = {
      select: () => q,
      eq:     () => q,
      gte:    () => q,
      lte:    () => q,
      order:  () => q,
      limit:  () => Promise.resolve({
        data:  fromData  ?? [],
        error: fromError ?? null,
      }),
    };
    return q;
  };

  return {
    from: qb,
    rpc:  () => Promise.resolve({
      data:  rpcData  ?? null,
      error: rpcError ?? null,
    }),
  };
}

// ── Constantes de teste ──────────────────────────────────────────
const LAT = -23.4516;
const LNG = -46.7460;
const RAIO = 5;

// ── Suítes ───────────────────────────────────────────────────────

suite('BarbeariaRepository.getNearby() — RPC disponível', () => {

  test('retorna o array do RPC quando PostGIS responde sem erro', async () => {
    const rpcData = [{ id: 'aaa', name: 'Barbearia Alpha', distancia_m: 1200 }];
    const db   = criarMockDb({ rpcData });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result), 'deve retornar array');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'aaa');
  });

  test('retorna array vazio quando RPC não encontra resultados', async () => {
    const db   = criarMockDb({ rpcData: [] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

});

suite('BarbeariaRepository.getNearby() — fallback bounding-box', () => {

  test('usa fallback quando RPC falha com PGRST202 (função inexistente)', async () => {
    const rpcError = {
      code:    'PGRST202',
      message: 'Could not find the function public.get_barbershops_nearby(lat, limit_val, lng, raio_metros) in the schema cache',
    };
    const fromData = [{ id: 'bbb', name: 'Barbearia Beta' }];
    const db   = criarMockDb({ rpcError, fromData });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'Barbearia Beta');
  });

  test('usa fallback quando RPC falha com erro PostgreSQL 42883 (undefined_function)', async () => {
    const rpcError = {
      code:    '42883',
      message: 'function get_barbershops_nearby(lat => double precision, ...) does not exist',
    };
    const fromData = [{ id: 'ccc', name: 'Barbearia Gamma' }];
    const db   = criarMockDb({ rpcError, fromData });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result[0].name, 'Barbearia Gamma');
  });

  test('usa fallback quando RPC falha com erro genérico (XX000)', async () => {
    const rpcError = { code: 'XX000', message: 'internal error' };
    const fromData = [{ id: 'ddd', name: 'Barbearia Delta' }];
    const db   = criarMockDb({ rpcError, fromData });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result[0].name, 'Barbearia Delta');
  });

  test('usa fallback quando RPC falha com erro de rede (sem code)', async () => {
    const rpcError = { message: 'Failed to fetch' };
    const fromData = [{ id: 'eee', name: 'Barbearia Epsilon' }];
    const db   = criarMockDb({ rpcError, fromData });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result[0].id, 'eee');
  });

  test('fallback retorna array vazio quando não há resultados no bounding-box', async () => {
    const rpcError = { code: 'PGRST202', message: 'Could not find the function' };
    const db   = criarMockDb({ rpcError, fromData: [] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getNearby(LAT, LNG, RAIO);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

});

suite('BarbeariaRepository.getNearby() — falha total (RPC + fallback)', () => {

  test('lança AppError(500) quando RPC e fallback ambos falham', async () => {
    const rpcError  = { code: 'PGRST202', message: 'Could not find the function' };
    const fromError = { code: 'XX000', message: 'connection refused' };
    const db   = criarMockDb({ rpcError, fromError });
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getNearby(LAT, LNG, RAIO),
      (err) => {
        assert.strictEqual(err.status, 500, 'status deve ser 500');
        return true;
      },
    );
  });

  test('lança AppError(500) quando RPC falha com erro genérico e fallback falha', async () => {
    const rpcError  = { code: 'XX000', message: 'timeout' };
    const fromError = { code: 'XX000', message: 'timeout' };
    const db   = criarMockDb({ rpcError, fromError });
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getNearby(LAT, LNG, RAIO),
      (err) => err.status === 500,
    );
  });

});

suite('BarbeariaRepository.getNearby() — validação de entrada', () => {

  test('lança AppError(400) para lat = NaN', async () => {
    const db   = criarMockDb();
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getNearby(NaN, LNG, RAIO),
      (err) => {
        assert.strictEqual(err.status, 400, 'status deve ser 400');
        return true;
      },
    );
  });

  test('lança AppError(400) para lng = NaN', async () => {
    const db   = criarMockDb();
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getNearby(LAT, NaN, RAIO),
      (err) => err.status === 400,
    );
  });

  test('lança AppError(400) para lat fora do intervalo válido (> 90)', async () => {
    const db   = criarMockDb();
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getNearby(91, LNG, RAIO),
      (err) => err.status === 400,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaRepository.getAll()
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaRepository.getAll()', () => {

  test('retorna [] quando banco está vazio', async () => {
    const db   = criarMockDb({ fromData: [] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getAll(10);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  test('retorna dados quando banco tem barbearias', async () => {
    const barbearia = { id: 'uuid-1', name: 'Barbearia Teste', is_active: true };
    const db   = criarMockDb({ fromData: [barbearia] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getAll(10);

    assert.deepStrictEqual(result, [barbearia]);
  });

  test('usa fallback quando query completa falha (coluna inexistente)', async () => {
    let chamadas = 0;
    const db = {
      from: () => {
        const q = {
          select: () => q,
          eq:     () => q,
          gte:    () => q,
          lte:    () => q,
          order:  () => q,
          limit:  () => {
            chamadas++;
            return chamadas === 1
              ? Promise.resolve({ data: null, error: { code: '42703', message: 'column rating_score does not exist' } })
              : Promise.resolve({ data: [],   error: null });
          },
        };
        return q;
      },
    };
    const repo = new BarbeariaRepository(db);

    const result = await repo.getAll(10);

    assert.deepStrictEqual(result, [], 'fallback deve retornar array vazio');
    assert.strictEqual(chamadas, 2, 'banco deve ser consultado duas vezes: full + fallback');
  });

  test('lança AppError(500) quando query completa e fallback ambas falham', async () => {
    const db = criarMockDb({ fromError: { code: '42P01', message: 'relation does not exist' } });
    const repo = new BarbeariaRepository(db);

    await assert.rejects(
      () => repo.getAll(10),
      (err) => {
        assert.strictEqual(err.status, 500);
        return true;
      },
    );
  });

});

// ────────────────────────────────────────────────────────────────
// BarbeariaRepository.getFeatured()
// ────────────────────────────────────────────────────────────────

suite('BarbeariaRepository.getFeatured()', () => {

  test('usa apenas colunas e ordenacao do schema base', async () => {
    const selects = [];
    const orders  = [];
    const db = {
      from: () => {
        const q = {
          select: (cols) => {
            selects.push(cols);
            return q;
          },
          eq:    () => q,
          order: (col) => {
            orders.push(col);
            return q;
          },
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return q;
      },
    };
    const repo = new BarbeariaRepository(db);

    const result = await repo.getFeatured(6);

    assert.deepStrictEqual(result, []);
    assert.strictEqual(selects.length, 1);
    assert.ok(!selects[0].includes('rating_score'), 'SELECT nao deve depender de rating_score');
    assert.ok(!selects[0].includes('likes_count'), 'SELECT nao deve depender de likes_count');
    assert.deepStrictEqual(orders, ['rating_avg', 'rating_count']);
  });

  test('retorna [] quando banco esta vazio', async () => {
    const db   = criarMockDb({ fromData: [] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.getFeatured(6);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

});
