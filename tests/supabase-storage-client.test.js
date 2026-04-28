'use strict';

// =============================================================
// supabase-storage-client.test.js
//
// Testa SupabaseStorageClient em isolamento via mocks do
// supabase.storage. Nenhuma chamada real à rede é feita.
//
// Executar: node --test tests/supabase-storage-client.test.js
// =============================================================

process.env.SUPABASE_URL = 'https://test-project.supabase.co';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

const SupabaseStorageClient = require('../src/infra/SupabaseStorageClient');

// ─── helpers ──────────────────────────────────────────────────

/**
 * Mock completo do supabase.storage com loja em memória.
 * Expõe `_store` (Map<path, {signedUrl, size, mimetype}>) para inspeção nos testes.
 */
function criarMockStorage() {
  const store = new Map(); // path → { size, mimetype }

  const builder = (bucket) => ({
    createSignedUploadUrl: async (path) => ({
      data:  { signedUrl: `https://supabase.mock/sign/${bucket}/${path}` },
      error: null,
    }),
    list: async (folder, opts) => {
      const filename = opts?.search;
      const fullPath = folder ? `${folder}/${filename}` : filename;
      const meta     = store.get(fullPath);
      if (!meta) return { data: [], error: null };
      return {
        data:  [{ name: filename, metadata: { size: meta.size, mimetype: meta.mimetype } }],
        error: null,
      };
    },
    remove: async ([path]) => {
      store.delete(path);
      return { error: null };
    },
    upload: async (path, buffer, _opts) => {
      store.set(path, { size: buffer.length, mimetype: _opts?.contentType ?? '' });
      return { error: null };
    },
  });

  return {
    storage: { from: (bucket) => builder(bucket) },
    // Auxiliar de teste: popula o store diretamente
    _semear: (path, size, mimetype) => store.set(path, { size, mimetype }),
    _store: store,
  };
}

/** Supabase que retorna erro em createSignedUploadUrl */
function criarMockStorageComErroPut() {
  return {
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({
          data:  null,
          error: { message: 'Storage quota exceeded' },
        }),
      }),
    },
  };
}

/** Supabase que retorna erro em remove */
function criarMockStorageComErroDelete() {
  return {
    storage: {
      from: () => ({
        remove: async () => ({
          error: { message: 'Permission denied' },
        }),
      }),
    },
  };
}

/** Supabase que retorna "not found" em remove (deve ser silenciado) */
function criarMockStorageDeleteNotFound() {
  return {
    storage: {
      from: () => ({
        remove: async () => ({
          error: { message: 'Object not found' },
        }),
      }),
    },
  };
}

// ─── Suite 1: presignedPut ─────────────────────────────────────

describe('SupabaseStorageClient.presignedPut()', () => {

  it('retorna URL assinada do Supabase para o path informado', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    const url = await svc.presignedPut('media-images', 'avatars/uid1/foto.webp');

    assert.ok(url.includes('supabase.mock'), 'URL deve ser do Supabase mock');
    assert.ok(url.includes('avatars/uid1/foto.webp'), 'URL deve conter o path');
  });

  it('URL contém o nome do bucket', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    const url = await svc.presignedPut('media-images', 'services/uid2/servico.jpg');

    assert.ok(url.includes('media-images'), 'URL deve conter o bucket');
  });

  it('lança Error{status:500} se Supabase retornar erro', async () => {
    const supabase = criarMockStorageComErroPut();
    const svc      = new SupabaseStorageClient(supabase);

    await assert.rejects(
      () => svc.presignedPut('media-images', 'avatars/uid1/foto.webp'),
      (err) => {
        assert.strictEqual(err.status, 500, 'status deve ser 500');
        assert.ok(err.message.includes('presignedPut falhou'), 'mensagem deve descrever a falha');
        return true;
      }
    );
  });

  it('lança erro se SUPABASE_URL não estiver definido', () => {
    const orig = process.env.SUPABASE_URL;
    try {
      delete process.env.SUPABASE_URL;
      assert.throws(
        () => new SupabaseStorageClient(criarMockStorage()),
        /SUPABASE_URL/,
        'deve lançar erro mencionando SUPABASE_URL'
      );
    } finally {
      process.env.SUPABASE_URL = orig;
    }
  });
});

// ─── Suite 2: head ─────────────────────────────────────────────

describe('SupabaseStorageClient.head()', () => {

  it('retorna {tamanhoBytes, contentType} quando arquivo existe', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    supabase._semear('avatars/uid1/foto.webp', 45678, 'image/webp');

    const info = await svc.head('media-images', 'avatars/uid1/foto.webp');

    assert.ok(info !== null,                         'deve retornar objeto (não null)');
    assert.strictEqual(info.tamanhoBytes, 45678,     'tamanhoBytes deve ser 45678');
    assert.strictEqual(info.contentType,  'image/webp', 'contentType deve ser image/webp');
  });

  it('retorna null quando arquivo não existe no bucket', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    const info = await svc.head('media-images', 'avatars/uid1/inexistente.webp');

    assert.strictEqual(info, null, 'deve retornar null para arquivo ausente');
  });

  it('funciona com path de subpasta profunda', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    supabase._semear('portfolio/uid2/foto.jpg', 120000, 'image/jpeg');

    const info = await svc.head('media-images', 'portfolio/uid2/foto.jpg');

    assert.ok(info !== null,                'deve encontrar em subpasta profunda');
    assert.strictEqual(info.tamanhoBytes, 120000);
  });

  it('usa valores 0 / string vazia como fallback quando metadata não existe', async () => {
    // Simula Supabase Storage que retorna arquivo sem campo metadata
    const supabase = {
      storage: {
        from: () => ({
          list: async (_folder, _opts) => ({
            data:  [{ name: 'foto.webp', metadata: null }],
            error: null,
          }),
        }),
      },
    };
    const svc  = new SupabaseStorageClient(supabase);
    const info = await svc.head('media-images', 'avatars/uid1/foto.webp');

    assert.ok(info !== null,             'deve retornar objeto mesmo sem metadata');
    assert.strictEqual(info.tamanhoBytes, 0);
    assert.strictEqual(info.contentType,  '');
  });
});

// ─── Suite 3: publicUrl ────────────────────────────────────────

describe('SupabaseStorageClient.publicUrl()', () => {

  it('monta URL pública correta sem barras duplicadas', () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    const url = svc.publicUrl('media-images', 'avatars/uid1/foto.webp');

    assert.strictEqual(
      url,
      'https://test-project.supabase.co/storage/v1/object/public/media-images/avatars/uid1/foto.webp'
    );
  });

  it('remove barra final da SUPABASE_URL antes de montar a URL', () => {
    const orig = process.env.SUPABASE_URL;
    try {
      process.env.SUPABASE_URL = 'https://test-project.supabase.co/'; // com barra
      const svc = new SupabaseStorageClient(criarMockStorage());
      const url = svc.publicUrl('media-images', 'services/uid2/img.jpg');
      assert.ok(!url.includes('//storage'), 'não deve ter barra dupla antes de /storage');
    } finally {
      process.env.SUPABASE_URL = orig;
    }
  });
});

// ─── Suite 4: delete ───────────────────────────────────────────

describe('SupabaseStorageClient.delete()', () => {

  it('remove arquivo do store (operação bem-sucedida)', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);

    supabase._semear('avatars/uid1/foto.webp', 1024, 'image/webp');

    // Confirma que existe antes
    const antes = await svc.head('media-images', 'avatars/uid1/foto.webp');
    assert.ok(antes !== null, 'deve existir antes da deleção');

    await assert.doesNotReject(() => svc.delete('media-images', 'avatars/uid1/foto.webp'));

    // Confirma remoção do store interno
    assert.ok(!supabase._store.has('avatars/uid1/foto.webp'), 'deve ter sido removido do store');
  });

  it('não lança erro quando arquivo já foi deletado (idempotente)', async () => {
    const supabase = criarMockStorageDeleteNotFound();
    const svc      = new SupabaseStorageClient(supabase);

    // "Object not found" deve ser silenciado
    await assert.doesNotReject(
      () => svc.delete('media-images', 'avatars/uid1/inexistente.webp'),
      'erro "not found" deve ser silenciado'
    );
  });

  it('lança Error{status:500} em erros reais de permissão', async () => {
    const supabase = criarMockStorageComErroDelete();
    const svc      = new SupabaseStorageClient(supabase);

    await assert.rejects(
      () => svc.delete('media-images', 'avatars/uid1/foto.webp'),
      (err) => {
        assert.strictEqual(err.status, 500, 'status deve ser 500');
        assert.ok(err.message.includes('delete falhou'), 'mensagem deve descrever a falha');
        return true;
      }
    );
  });
});

// ─── Suite 5: constante estática ──────────────────────────────

describe('SupabaseStorageClient.BUCKET_IMAGES', () => {

  it('é "media-images"', () => {
    assert.strictEqual(SupabaseStorageClient.BUCKET_IMAGES, 'media-images');
  });
});

// ─── Suite 6: upload() ────────────────────────────────────────

describe('SupabaseStorageClient.upload()', () => {

  it('armazena buffer no storage e não lança erro', async () => {
    const supabase = criarMockStorage();
    const svc      = new SupabaseStorageClient(supabase);
    const buffer   = Buffer.from('dados-de-imagem-fake');

    await assert.doesNotReject(
      () => svc.upload('media-images', 'avatars/uid1/foto.webp', buffer, 'image/webp'),
      'upload bem-sucedido não deve lançar erro'
    );

    // Confirma que o mock armazenou o buffer
    assert.ok(
      supabase._store.has('avatars/uid1/foto.webp'),
      'arquivo deve estar no store após upload'
    );
  });

  it('lança Error{status:500} quando Supabase retorna erro', async () => {
    const supabase = {
      storage: {
        from: () => ({
          upload: async () => ({ error: { message: 'Bucket not found' } }),
        }),
      },
    };
    const svc = new SupabaseStorageClient(supabase);

    await assert.rejects(
      () => svc.upload('media-images', 'avatars/uid1/foto.webp', Buffer.from('x'), 'image/webp'),
      (err) => {
        assert.strictEqual(err.status, 500, 'status deve ser 500');
        assert.ok(err.message.includes('upload falhou'), 'mensagem deve descrever a falha');
        return true;
      }
    );
  });

});
