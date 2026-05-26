'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Env ──────────────────────────────────────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-supabase-jwt-secret-for-testing-only-32chars';

const SupabaseClient = require('../utils/SupabaseClient');
const { gerarTokenSupa, UUID_TEST } = require('./_helpers');

const USER_ID  = UUID_TEST;
const PHOTO_ID = '770e8400-e29b-41d4-a716-446655440001';

// ── Mock DB genérico ─────────────────────────────────────────────
const _qb = () => {
  const q = {
    select:     () => q,
    insert:     () => q,
    update:     () => q,
    eq:         () => q,
    neq:        () => q,
    neq:        () => q,
    order:      () => q,
    range:      () => q,
    limit:      () => Promise.resolve({ data: [], error: null, count: 0 }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single:      () => Promise.resolve({ data: null, error: null }),
  };
  return q;
};

const mockDb = {
  from: () => _qb(),
  rpc:  () => Promise.resolve({ data: null, error: null }),
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
    }),
  },
};

SupabaseClient.getInstance = () => mockDb;

const ProfissionalService = require('../services/ProfissionalService');
const criarApp = require('../app');

// ════════════════════════════════════════════════════════════════
// UNIT — ProfissionalService (mockando repo)
// ════════════════════════════════════════════════════════════════

function criarRepo(overrides = {}) {
  const FOTO_ROW = {
    id: PHOTO_ID,
    title: null,
    description: null,
    category: null,
    storage_path: `${USER_ID}/fotos/abc.webp`,
    thumbnail_path: null,
    likes_count: 0,
    views_count: 0,
    is_featured: false,
    updated_at: '2026-05-25T00:00:00.000Z',
  };
  return {
    buscarPerfilPublico:    async () => ({ id: USER_ID }),
    atualizarPerfilPublico: async () => ({}),
    buscarContextoMensagem: async () => null,
    encontrarConversaDireta: async () => null,
    criarConversaDireta:    async () => null,
    buscarRoleUsuario:      async () => 'professional',
    listarPortfolioPublico: async () => ({ items: [], total: 0 }),
    atualizarPortfolioImagem: async () => FOTO_ROW,
    removerPortfolioImagem: async () => ({ deleted: true, storage_path: FOTO_ROW.storage_path }),
    removerArquivoPortfolio: async () => {},
    listarMeuPortfolio:     async () => ({ items: [FOTO_ROW], total: 1 }),
    contarPortfolioImagens: async () => 0,
    salvarPortfolioImagem:  async () => FOTO_ROW,
    uploadPortfolioImagem:  async () => {},
    getPortfolioPublicUrl:  (path) => `https://test.supabase.co/storage/v1/object/public/portfolio/${path}`,
    getConvites:            async () => [],
    aceitarConvite:         async () => ({ aceito: true }),
    recusarConvite:         async () => ({ recusado: true }),
    ...overrides,
  };
}

// JPEG buffer mínimo (magic bytes FF D8 FF + cabeçalho mínimo)
const JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
  0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...Array(50).fill(0x00),
]);

suite('ProfissionalService — listarMeuPortfolio', () => {
  test('retorna array com DTOs das próprias fotos', async () => {
    const service = new ProfissionalService(criarRepo());
    const result  = await service.listarMeuPortfolio(USER_ID, {});

    assert.ok(Array.isArray(result.items));
    assert.strictEqual(result.items.length, 1);
    assert.ok(result.items[0].storagePath?.includes('.webp'));
  });

  test('rejeita UUID inválido', async () => {
    const service = new ProfissionalService(criarRepo());
    await assert.rejects(
      () => service.listarMeuPortfolio('nao-uuid', {}),
      err => err.status === 400,
    );
  });
  test('salva imagem processada no storage e metadados no banco pela BFF', async () => {
    let upload = null;
    let metadata = null;
    const service = new ProfissionalService(
      criarRepo({
        uploadPortfolioImagem: async (path, buffer, contentType) => {
          upload = { path, buffer, contentType };
        },
        salvarPortfolioImagem: async (userId, storagePath, thumbnailPath) => {
          metadata = { userId, storagePath, thumbnailPath };
          return {
            id: PHOTO_ID,
            title: null,
            description: null,
            category: null,
            storage_path: storagePath,
            thumbnail_path: thumbnailPath,
            likes_count: 0,
            views_count: 0,
            is_featured: false,
            updated_at: '2026-05-25T00:00:00.000Z',
          };
        },
      }),
      null,
      {
        uuid: () => 'foto-test',
        processarImagem: async () => Buffer.from('webp-menor'),
      },
    );

    const result = await service.uploadPortfolioImagem(USER_ID, JPEG_BUFFER, 'image/jpeg');

    assert.strictEqual(upload.contentType, 'image/webp');
    assert.strictEqual(upload.buffer.toString(), 'webp-menor');
    assert.strictEqual(metadata.storagePath, `${USER_ID}/fotos/foto-test.webp`);
    assert.strictEqual(metadata.thumbnailPath, metadata.storagePath);
    assert.strictEqual(result.storagePath, metadata.storagePath);
  });
});

suite('ProfissionalService — uploadPortfolioImagem', () => {
  test('rejeita quando buffer não é Buffer', async () => {
    const service = new ProfissionalService(criarRepo());
    await assert.rejects(
      () => service.uploadPortfolioImagem(USER_ID, 'string-errado', 'image/jpeg'),
      err => err.status === 400,
    );
  });

  test('rejeita MIME inválido por magic bytes (buffer com bytes aleatórios)', async () => {
    const service = new ProfissionalService(criarRepo());
    const bufferInvalido = Buffer.from('isto nao eh imagem XYZXYZ');
    await assert.rejects(
      () => service.uploadPortfolioImagem(USER_ID, bufferInvalido, 'image/jpeg'),
      err => err.status === 400,
    );
  });

  test('rejeita buffer vazio', async () => {
    const service = new ProfissionalService(criarRepo());
    await assert.rejects(
      () => service.uploadPortfolioImagem(USER_ID, Buffer.alloc(0), 'image/jpeg'),
      err => err.status === 400,
    );
  });

  test('rejeita quando já existem 10 fotos', async () => {
    const service = new ProfissionalService(
      criarRepo({ contarPortfolioImagens: async () => 10 }),
    );
    await assert.rejects(
      () => service.uploadPortfolioImagem(USER_ID, JPEG_BUFFER, 'image/jpeg'),
      err => err.status === 409,
    );
  });

  test('rejeita UUID de userId inválido', async () => {
    const service = new ProfissionalService(criarRepo());
    await assert.rejects(
      () => service.uploadPortfolioImagem('bad-uuid', JPEG_BUFFER, 'image/jpeg'),
      err => err.status === 400,
    );
  });
});

suite('ProfissionalService — removerPortfolioImagem com storage', () => {
  test('chama removerArquivoPortfolio quando storage_path existe', async () => {
    let removeuStorage = false;
    const service = new ProfissionalService(criarRepo({
      removerArquivoPortfolio: async () => { removeuStorage = true; },
    }));

    const result = await service.removerPortfolioImagem(USER_ID, PHOTO_ID);

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(removeuStorage, true, 'devia ter removido do storage');
  });

  test('não lança erro se storage_path for nulo', async () => {
    const service = new ProfissionalService(criarRepo({
      removerPortfolioImagem: async () => ({ deleted: true, storage_path: null }),
    }));
    const result = await service.removerPortfolioImagem(USER_ID, PHOTO_ID);
    assert.strictEqual(result.deleted, true);
  });

  test('lança 404 quando imagem não encontrada', async () => {
    const service = new ProfissionalService(criarRepo({
      removerPortfolioImagem: async () => ({ deleted: false, storage_path: null }),
    }));
    await assert.rejects(
      () => service.removerPortfolioImagem(USER_ID, PHOTO_ID),
      err => err.status === 404,
    );
  });
});

// ════════════════════════════════════════════════════════════════
// HTTP — Integração (app rodando em porta 0)
// ════════════════════════════════════════════════════════════════

let server;
let port;

before(async () => {
  const app = criarApp(mockDb);
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

function get(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers },
      res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function postBinario(path, buffer, { token = gerarTokenSupa(), contentType = 'image/jpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

suite('GET /api/v1/profissionais/me/portfolio', () => {
  test('retorna 401 sem token', async () => {
    const { status } = await get('/api/v1/profissionais/me/portfolio');
    assert.strictEqual(status, 401);
  });

  test('retorna 200 com token válido', async () => {
    const { status, body } = await get(
      '/api/v1/profissionais/me/portfolio',
      gerarTokenSupa(),
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna array em dados', async () => {
    const { body } = await get(
      '/api/v1/profissionais/me/portfolio',
      gerarTokenSupa(),
    );
    assert.ok(Array.isArray(body.dados));
  });
});

suite('POST /api/v1/profissionais/me/portfolio', () => {
  test('retorna 401 sem token', async () => {
    const { status } = await postBinario(
      '/api/v1/profissionais/me/portfolio',
      Buffer.from('bytes'),
      { token: null },
    );
    assert.strictEqual(status, 401);
  });

  test('retorna 400 com buffer sem magic bytes de imagem', async () => {
    const { status } = await postBinario(
      '/api/v1/profissionais/me/portfolio',
      Buffer.from('nao eh imagem alguma XYZXYZ'),
      { token: gerarTokenSupa() },
    );
    assert.strictEqual(status, 400);
  });
});
