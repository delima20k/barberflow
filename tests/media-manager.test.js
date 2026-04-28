'use strict';

// =============================================================
// media-manager.test.js — Testes de integração do MediaManager.
//
// Cobre: uploadMedia(), downloadMedia() com todos os sistemas
// integrados: EncryptionService, ChunkService, HashService,
// FallbackService, CacheService, PeerHealthService.
//
// Executar:  node --test tests/media-manager.test.js
// =============================================================

// Variável obrigatória antes de qualquer require do MediaManager
process.env.MEDIA_SIGNING_SECRET = 'test-signing-secret-must-be-32c!';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const crypto           = require('node:crypto');

const MediaManager = require('../src/services/MediaManager');
const CacheService  = require('../src/services/CacheService');

// ── UUIDs de teste ─────────────────────────────────────────────
const UUID_OWNER_A = '00000000-0000-4000-8000-000000000001';
const UUID_OWNER_B = '00000000-0000-4000-8000-000000000002';
const PEER_URL_1   = 'https://peer1.barberflow.example.com';

// ── Mock factories ─────────────────────────────────────────────

/**
 * Mock do R2Client com armazenamento em memória.
 * Expõe `_store` para manipulação direta nos testes.
 */
function criarMockR2() {
  const store = new Map();
  return {
    putBuffer:    async (path, buffer) => { store.set(path, buffer); },
    getBuffer:    async (path) => store.get(path) ?? null,
    head:         async (path) => store.has(path)
      ? { tamanhoBytes: store.get(path).length, contentType: 'application/octet-stream' }
      : null,
    presignedPut: async (path) => `https://r2.mock/${path}?sig=test`,
    publicUrl:    (path) => `https://r2.mock/${path}`,
    _store: store,
  };
}

/**
 * Mock do Supabase com armazenamento em memória.
 * Suporta as chains: insert().select().single() e select().eq().maybeSingle()
 * Expõe `_registros` para inspeção nos testes.
 */
function criarMockSupabase() {
  const registros = new Map();
  return {
    from: (_tabela) => {
      let payload = null;
      let filtros = {};
      const b = {
        insert:     (p)           => { payload = p; return b; },
        select:     ()            => b,
        eq:         (campo, val)  => { filtros[campo] = val; return b; },
        single:     async ()      => {
          const id  = crypto.randomUUID();
          const rec = { id, ...payload };
          registros.set(id, rec);
          return { data: { id }, error: null };
        },
        maybeSingle: async () => {
          const id  = filtros['id'];
          const rec = registros.get(id) ?? null;
          return { data: rec, error: null };
        },
      };
      return b;
    },
    _registros: registros,
  };
}

/**
 * Mock do Supabase que injeta erro em operações específicas.
 * @param {'insert'|'select'} tipo — qual operação deve falhar
 */
function criarMockSupabaseComErro(tipo) {
  return {
    from: () => {
      const b = {
        insert:      () => b,
        select:      () => b,
        eq:          () => b,
        single:      async () => tipo === 'insert'
          ? { data: null, error: { message: 'DB insert error simulado' } }
          : { data: null, error: null },
        maybeSingle: async () => tipo === 'select'
          ? { data: null, error: { message: 'DB select error simulado' } }
          : { data: null, error: null },
      };
      return b;
    },
  };
}

/**
 * Mock do Supabase que armazena o registro mas sobrescreve `metadata` com {}.
 * Usado para testar o caso de metadados de criptografia ausentes.
 */
function criarMockSupabaseSemCripto() {
  const registros = new Map();
  return {
    from: (_tabela) => {
      let payload = null;
      let filtros = {};
      const b = {
        insert:      (p)          => { payload = p; return b; },
        select:      ()           => b,
        eq:          (campo, val) => { filtros[campo] = val; return b; },
        single:      async ()     => {
          const id  = crypto.randomUUID();
          // Força metadados vazios (simula dado corrompido no banco)
          const rec = { id, ...payload, metadata: {} };
          registros.set(id, rec);
          return { data: { id }, error: null };
        },
        maybeSingle: async () => {
          const id  = filtros['id'];
          const rec = registros.get(id) ?? null;
          return { data: rec, error: null };
        },
      };
      return b;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Suite 1: uploadMedia()
// ═══════════════════════════════════════════════════════════════
describe('uploadMedia()', () => {

  it('retorna id, path e tamanhoBytes após upload bem-sucedido', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const svc      = new MediaManager(r2, supabase);

    const { id, path, tamanhoBytes, peersUsed } = await svc.uploadMedia({
      buffer:      Buffer.from('conteudo-barbearia-teste'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    assert.ok(typeof id === 'string' && id.length > 0,        'id deve ser string não-vazia');
    assert.ok(path.startsWith('avatars/'),                     `path deve começar com "avatars/", recebeu: ${path}`);
    assert.ok(tamanhoBytes > 0,                                'tamanhoBytes deve ser positivo');
    assert.deepEqual(peersUsed, [],                            'sem peers configurados, peersUsed deve ser []');
    assert.ok(r2._store.has(path),                             'ciphertext deve ter sido salvo no R2');
  });

  it('P2P upload bem-sucedido → peersUsed contém a URL do peer', async () => {
    const r2         = criarMockR2();
    const supabase   = criarMockSupabase();
    let uploadedPath = null;
    const peerHealth   = { getBestPeer: async () => PEER_URL_1 };
    const p2pUploader  = {
      upload: async (path, _data, _peerUrl) => { uploadedPath = path; },
    };
    const svc = new MediaManager(r2, supabase, { peerHealth, p2pUploader });

    const { peersUsed, path } = await svc.uploadMedia({
      buffer:      Buffer.from('conteudo-p2p'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
      peers:       [PEER_URL_1],
    });

    assert.deepEqual(peersUsed, [PEER_URL_1], 'peersUsed deve conter o peer selecionado');
    assert.equal(uploadedPath, path,           'p2pUploader deve ter recebido o path correto');
  });

  it('P2P upload falha → peersUsed vazio; upload via R2 bem-sucedido', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const peerHealth  = { getBestPeer: async () => PEER_URL_1 };
    const p2pUploader = { upload: async () => { throw new Error('peer fora do ar'); } };
    const svc = new MediaManager(r2, supabase, { peerHealth, p2pUploader });

    const { id, peersUsed } = await svc.uploadMedia({
      buffer:      Buffer.from('conteudo-com-peer-offline'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
      peers:       [PEER_URL_1],
    });

    assert.deepEqual(peersUsed, [], 'peer com falha não deve constar em peersUsed');
    assert.ok(typeof id === 'string', 'upload deve ter sucesso via R2 mesmo com P2P falhando');
  });

  it('arquivo acima do limite de tamanho → erro 413', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());
    // avatars maxBytes = 2 MB; enviamos 3 MB
    const grande = Buffer.alloc(3 * 1024 * 1024, 0xff);

    await assert.rejects(
      () => svc.uploadMedia({ buffer: grande, contexto: 'avatars', ownerId: UUID_OWNER_A, contentType: 'image/png' }),
      (err) => { assert.equal(err.status, 413); return true; }
    );
  });

  it('MIME inválido para contexto avatars → erro 415', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.uploadMedia({ buffer: Buffer.from('x'), contexto: 'avatars', ownerId: UUID_OWNER_A, contentType: 'video/mp4' }),
      (err) => { assert.equal(err.status, 415); return true; }
    );
  });

  it('buffer não é um Buffer → erro 400', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.uploadMedia({ buffer: 'nao-e-buffer', contexto: 'avatars', ownerId: UUID_OWNER_A, contentType: 'image/png' }),
      (err) => { assert.equal(err.status, 400); return true; }
    );
  });

  it('ownerId inválido (não é UUID) → erro 400', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.uploadMedia({ buffer: Buffer.from('x'), contexto: 'avatars', ownerId: 'nao-e-uuid', contentType: 'image/png' }),
      (err) => { assert.equal(err.status, 400); return true; }
    );
  });

});

// ═══════════════════════════════════════════════════════════════
// Suite 2: downloadMedia()
// ═══════════════════════════════════════════════════════════════
describe('downloadMedia()', () => {

  it('ciclo completo: upload → download retorna plaintext original', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const svc      = new MediaManager(r2, supabase);

    const plaintext = Buffer.from('arquivo-original-da-barbearia-42');
    const { id } = await svc.uploadMedia({
      buffer:      plaintext,
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    const resultado = await svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A });

    assert.deepEqual(resultado, plaintext, 'plaintext recuperado deve ser idêntico ao original');
  });

  it('arquivo não encontrado → erro 404', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.downloadMedia({ fileId: crypto.randomUUID(), userId: UUID_OWNER_A }),
      (err) => { assert.equal(err.status, 404); return true; }
    );
  });

  it('acesso negado: userId diferente do owner_id → erro 403', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const svc      = new MediaManager(r2, supabase);

    const { id } = await svc.uploadMedia({
      buffer:      Buffer.from('arquivo-privado'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    await assert.rejects(
      () => svc.downloadMedia({ fileId: id, userId: UUID_OWNER_B }),
      (err) => { assert.equal(err.status, 403); return true; }
    );
  });

  it('peer offline → FallbackService usa R2 → retorna plaintext correto', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    let tentativaP2P = 0;
    const peerHealth    = { getBestPeer: async () => PEER_URL_1 };
    // p2pUploader bem-sucedido durante o upload (salva PEER_URL_1 em peers_used)
    const p2pUploader   = { upload: async () => {} };
    // p2pDownloader falha durante o download (simula peer offline)
    const p2pDownloader = {
      get: async () => { tentativaP2P++; throw new Error('peer offline'); },
    };
    const svc = new MediaManager(r2, supabase, { peerHealth, p2pUploader, p2pDownloader });

    const plaintext = Buffer.from('conteudo-via-r2-fallback-quando-peer-offline');
    const { id } = await svc.uploadMedia({
      buffer:      plaintext,
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
      peers:       [PEER_URL_1],
    });

    const resultado = await svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A });

    assert.ok(tentativaP2P > 0,                                  'P2P deve ter sido tentado antes do fallback');
    assert.deepEqual(resultado, plaintext,                        'conteúdo deve ser correto mesmo após peer falhar');
  });

  it('ciphertext corrompido → erro 422', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const svc      = new MediaManager(r2, supabase);

    const { id, path } = await svc.uploadMedia({
      buffer:      Buffer.from('conteudo-original-nao-adulterado'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    // Adulterar o ciphertext no R2 mockado
    r2._store.set(path, Buffer.from('CIPHERTEXT-ADULTERADO-INVALIDO-XXXX'));

    await assert.rejects(
      () => svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A }),
      (err) => { assert.equal(err.status, 422); return true; }
    );
  });

  it('erro no Supabase ao buscar metadados → erro 500', async () => {
    const r2          = criarMockR2();
    const supabaseErr = criarMockSupabaseComErro('select');
    const svc         = new MediaManager(r2, supabaseErr);

    // downloadMedia direto com fileId qualquer — o select vai falhar
    await assert.rejects(
      () => svc.downloadMedia({ fileId: crypto.randomUUID(), userId: UUID_OWNER_A }),
      (err) => { assert.equal(err.status, 500); return true; }
    );
  });

  it('segundo download lido do cache (R2 indisponível)', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const cache    = new CacheService({ mode: 'memory', ttl: 60_000 });
    const svc      = new MediaManager(r2, supabase, { cache });

    const plaintext = Buffer.from('arquivo-que-deve-ser-cacheado-no-segundo-download');
    const { id } = await svc.uploadMedia({
      buffer:      plaintext,
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    // Primeiro download: popula o cache com o ciphertext
    await svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A });

    // Tornar R2 indisponível
    r2._store.clear();

    // Segundo download: deve vir do cache sem precisar do R2
    const resultado = await svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A });
    assert.deepEqual(resultado, plaintext, 'CacheService deve entregar o conteúdo sem R2');
  });

});

// ═══════════════════════════════════════════════════════════════
// Suite 3: Segurança
// ═══════════════════════════════════════════════════════════════
describe('Segurança', () => {

  it('acesso cruzado: user B tenta baixar arquivo de user A → 403', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabase();
    const svc      = new MediaManager(r2, supabase);

    const { id } = await svc.uploadMedia({
      buffer:      Buffer.from('arquivo-privado-do-usuario-a'),
      contexto:    'services',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/jpeg',
    });

    await assert.rejects(
      () => svc.downloadMedia({ fileId: id, userId: UUID_OWNER_B }),
      (err) => { assert.equal(err.status, 403); return true; }
    );
  });

  it('metadados de criptografia ausentes no banco → erro 500', async () => {
    const r2       = criarMockR2();
    const supabase = criarMockSupabaseSemCripto();
    const svc      = new MediaManager(r2, supabase);

    const { id } = await svc.uploadMedia({
      buffer:      Buffer.from('conteudo'),
      contexto:    'avatars',
      ownerId:     UUID_OWNER_A,
      contentType: 'image/png',
    });

    await assert.rejects(
      () => svc.downloadMedia({ fileId: id, userId: UUID_OWNER_A }),
      (err) => { assert.equal(err.status, 500); return true; }
    );
  });

  it('fileId inválido (não UUID) → erro 400', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.downloadMedia({ fileId: 'nao-e-uuid', userId: UUID_OWNER_A }),
      (err) => { assert.equal(err.status, 400); return true; }
    );
  });

  it('userId inválido (não UUID) → erro 400', async () => {
    const svc = new MediaManager(criarMockR2(), criarMockSupabase());

    await assert.rejects(
      () => svc.downloadMedia({ fileId: crypto.randomUUID(), userId: 'nao-e-uuid' }),
      (err) => { assert.equal(err.status, 400); return true; }
    );
  });

});
