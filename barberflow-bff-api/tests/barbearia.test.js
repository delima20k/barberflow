'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http   = require('node:http');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-supabase-jwt-secret-for-testing-only-32chars';

// ── Stub do SupabaseClient — deve vir ANTES do require('../app') ──
// Sobrescreve getInstance para retornar um cliente falso que
// responde todas as queries com { data: [], error: null }.
// mockDb exposto no escopo de módulo para permitir override em testes de fallback.
const SupabaseClient = require('../utils/SupabaseClient');
const { gerarTokenSupa } = require('./_helpers');
const _qb = () => {
  const q = {
    select:  () => q,
    eq:      () => q,
    gte:     () => q,
    lte:     () => q,
    order:   () => q,
    limit:   () => Promise.resolve({ data: [], error: null }),
    single:  () => Promise.resolve({ data: { id: 'shop-1', owner_id: '00000000-0000-4000-8000-000000000001', is_active: true }, error: null }),
    maybeSingle: () => Promise.resolve({ data: { id: 'shop-1', owner_id: '00000000-0000-4000-8000-000000000001', is_active: true }, error: null }),
  };
  return q;
};
const mockDb = {
  from: _qb,
  rpc:  () => Promise.resolve({ data: [], error: null }),
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: { path: 'shop-1/og-card.png' }, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: (storagePath) => ({ data: { publicUrl: `https://storage.test/${storagePath}` } }),
    }),
  },
};
SupabaseClient.getInstance = () => mockDb;

const criarApp = require('../app');

let server;
let port;

before(async () => {
  const app = criarApp(mockDb);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ── Helpers HTTP ─────────────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

function patchBinario(path, buffer, { token = gerarTokenSupa(), contentType = 'image/png' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'PATCH',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.end(buffer);
  });
}

// ── Testes ────────────────────────────────────────────────────────

suite('BarbeariaController — GET /api/v1/barbearias (proximas)', () => {

  test('responde 200 com lat e lng válidos', async () => {
    const { status } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true } com lat e lng válidos', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('retorna total numérico', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(typeof body.meta?.total === 'number', 'meta.total deve ser número');
  });

  test('400 sem lat', async () => {
    const { status, body } = await get('/api/v1/barbearias?lng=-47.88');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 sem lng', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 sem nenhuma coordenada', async () => {
    const { status, body } = await get('/api/v1/barbearias');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com lat não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=abc&lng=-47.88');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com raio fora do intervalo (>100)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=999');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('aceita raio customizado válido', async () => {
    const { status } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=10');
    assert.strictEqual(status, 200);
  });

});

suite('BarbeariaController — GET /api/v1/barbearias/destaque', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/v1/barbearias/destaque');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/v1/barbearias/destaque');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias/destaque');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('aceita limit customizado', async () => {
    const { status } = await get('/api/v1/barbearias/destaque?limit=3');
    assert.strictEqual(status, 200);
  });

  test('400 com limit não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias/destaque?limit=abc');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

});

suite('BarbeariaController — GET /api/v1/barbearias/todas', () => {

  test('responde 200', async () => {
    const { status } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(status, 200);
  });

  test('retorna { ok: true }', async () => {
    const { body } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get('/api/v1/barbearias/todas');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array');
  });

  test('aceita limit customizado', async () => {
    const { status } = await get('/api/v1/barbearias/todas?limit=10');
    assert.strictEqual(status, 200);
  });

  test('400 com limit não numérico', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=xyz');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com limit = 0 (abaixo do mínimo)', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=0');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('400 com limit = 101 (acima do máximo)', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas?limit=101');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('200 com array vazio quando banco não tem barbearias', async () => {
    const { status, body } = await get('/api/v1/barbearias/todas');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.dados));
  });

});

suite('BarbeariaController — GET /api/v1/barbearias (fallback bounding-box)', () => {

  // Guarda referência original do mock de rpc para restaurar após a suíte
  let rpcOriginal;

  before(() => {
    rpcOriginal  = mockDb.rpc;
    // Simula RPC indisponível (PostGIS não instalado — PGRST202)
    mockDb.rpc = () => Promise.resolve({
      data:  null,
      error: {
        code:    'PGRST202',
        message: 'Could not find the function public.get_barbershops_nearby(lat, limit_val, lng, raio_metros) in the schema cache',
      },
    });
  });

  after(() => {
    mockDb.rpc = rpcOriginal;
  });

  test('retorna 200 mesmo quando RPC falha (fallback bounding-box ativo)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados via fallback', async () => {
    const { body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array mesmo via fallback');
  });

  test('400 com raio abaixo do mínimo permitido (< 5)', async () => {
    const { status, body } = await get('/api/v1/barbearias?lat=-15.79&lng=-47.88&raio=1');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

});

// ── Suite de fallback SELECT_SAFE para getFeatured ───────────────
// Usa servidor isolado com mock que simula colunas ausentes no banco
// (rating_score, likes_count etc.) — verifica que #getFeaturedFallback
// é ativado e retorna 200 em vez de 500.
suite('BarbeariaController — GET /api/v1/barbearias/destaque (fallback SELECT_SAFE)', () => {

  let server2;
  let port2;

  // Query builder que simula erro de coluna ausente (ex: migration não aplicada).
  const _qbErro = () => {
    const q = {
      select: () => q,
      eq:     () => q,
      order:  () => q,
      limit:  () => Promise.resolve({
        data:  null,
        error: { code: '42703', message: "column rating_score does not exist" },
      }),
    };
    return q;
  };

  // Mock alternado: chamadas ímpares retornam erro (SELECT completo),
  // chamadas pares retornam sucesso (SELECT_SAFE / fallback).
  let fromCalls = 0;
  const fallbackMockDb = {
    from: () => {
      fromCalls++;
      return fromCalls % 2 === 1 ? _qbErro() : _qb();
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
  };

  before(async () => {
    fromCalls = 0;
    const app2 = criarApp(fallbackMockDb);
    await new Promise((resolve) => {
      server2 = app2.listen(0, '127.0.0.1', resolve);
    });
    port2 = server2.address().port;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server2.close((err) => (err ? reject(err) : resolve())),
    );
  });

  function get2(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port2}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      }).on('error', reject);
    });
  }

  test('retorna 200 quando SELECT completo falha (fallback SELECT_SAFE ativo)', async () => {
    fromCalls = 0; // garante que próxima chamada seja ímpar (erro)
    const { status, body } = await get2('/api/v1/barbearias/destaque');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados via fallback SELECT_SAFE', async () => {
    fromCalls = 0;
    const { body } = await get2('/api/v1/barbearias/destaque');
    assert.ok(Array.isArray(body.dados), 'dados deve ser array mesmo via fallback');
  });

});

suite('BarbeariaController - PATCH /api/v1/barbearias/minha/imagem', () => {
  test('expoe upload binario pela BFF e valida imagem invalida', async () => {
    const { status, body } = await patchBinario(
      '/api/v1/barbearias/minha/imagem?tipo=logo',
      Buffer.from('legacy-bytes'),
    );

    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });
});

suite('BarbeariaController - PATCH /api/v1/barbearias/minha/og-card', () => {
  test('salva card autenticado e retorna URL publica (reencodado p/ JPEG)', async () => {
    const sharp = require('sharp');
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    const { status, body } = await patchBinario(
      '/api/v1/barbearias/minha/og-card',
      png,
    );

    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.dados.path, 'shop-1/og-card.jpg');
    assert.match(body.dados.publicUrl, /shop-1\/og-card\.jpg$/);
  });

  test('sem auth retorna 401, confirmando rota registrada antes do handler', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { status, body } = await patchBinario(
      '/api/v1/barbearias/minha/og-card',
      pngHeader,
      { token: null },
    );

    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('arquivo vazio retorna 400', async () => {
    const { status, body } = await patchBinario(
      '/api/v1/barbearias/minha/og-card',
      Buffer.alloc(0),
    );

    assert.strictEqual(status, 400);
    assert.strictEqual(body.ok, false);
  });

  test('usuario sem barbearia retorna 404 de dominio', async () => {
    const fromOriginal = mockDb.from;
    mockDb.from = () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return q;
    };

    try {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const { status, body } = await patchBinario(
        '/api/v1/barbearias/minha/og-card',
        pngHeader,
      );

      assert.strictEqual(status, 404);
      assert.strictEqual(body.ok, false);
      assert.match(body.error, /Barbearia n/i);
    } finally {
      mockDb.from = fromOriginal;
    }
  });
});

suite('BarbeariaService - portfolio agregado', () => {
  test('portfolio agregado anexa interactions sem criar rota nova', () => {
    const serviceJs = fs.readFileSync(path.join(__dirname, '..', 'services', 'BarbeariaService.js'), 'utf8');
    const repoJs = fs.readFileSync(path.join(__dirname, '..', 'repositories', 'BarbeariaRepository.js'), 'utf8');

    assert.match(serviceJs, /#portfolioInteractionsMap/);
    assert.match(serviceJs, /listarInteracoesPortfolio/);
    assert.match(serviceJs, /interactions:\s*BarbeariaService\.#portfolioInteractionsDto/);
    assert.match(serviceJs, /type:\s*BarbeariaService\.#isEmoji\(body\) \? 'emoji' : 'message'/);
    assert.match(repoJs, /async listarInteracoesPortfolio\(imageIds\)/);
    assert.match(repoJs, /\.in\('portfolio_image_id', ids\)/);
    assert.match(repoJs, /\.from\('profiles'\)/);
  });
});
