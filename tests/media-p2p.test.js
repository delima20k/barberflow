'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_helpers.js');

function carregarMediaP2P(fetchImpl) {
  class FileMock {
    constructor(parts, name, options = {}) {
      this.parts = parts;
      this.name = name;
      this.type = options.type ?? '';
      this.size = parts.reduce((total, part) => total + String(part).length, 0);
    }
  }

  const revoked = [];
  const sandbox = vm.createContext({
    File: FileMock,
    URL: {
      createObjectURL: () => 'blob:story',
      revokeObjectURL: (url) => revoked.push(url),
    },
    window: { BFF_URL: 'https://bff.test', confirm: () => true },
    fetch: fetchImpl,
    SupabaseService: {
      getSession: async () => ({ access_token: 'jwt-test' }),
    },
  });
  carregar(sandbox, 'shared/js/MediaP2P.js');
  return { MediaP2P: sandbox.MediaP2P, FileMock, revoked };
}

describe('MediaP2P', () => {
  it('usa presigned (R2 direto) para story video — sem passar pela funcao BFF', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/api/v1/media/presigned')) {
        return {
          ok: true,
          json: async () => ({ dados: {
            uploadUrl: 'https://r2.test/upload',
            path: 'stories/user/incoming/media.mp4',
            publicUrl: 'https://cdn.test/media.mp4',
            token: 'confirm-token',
            expiresAt: '2026-06-21T12:00:00.000Z',
            mediaId: 'media-1',
          } }),
        };
      }
      if (url === 'https://r2.test/upload') return { ok: true, json: async () => ({}) };
      if (url.endsWith('/api/v1/media/confirmar')) return { ok: true, json: async () => ({ dados: { status: 'queued' } }) };
      throw new Error(`URL inesperada: ${url}`);
    };
    const { MediaP2P, FileMock } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['video'], 'story.mp4', { type: 'video/mp4' });

    await media.registrar(file, 'story-1');
    const result = await media.fazerUpload('story-1', 'stories', { barbershopId: 'shop-1' });

    assert.equal(result.mediaId, 'media-1');
    // Vídeo vai DIRETO ao R2 (PUT), sem trafegar pela função BFF (sem limite de corpo).
    assert.equal(calls[0].url, 'https://bff.test/api/v1/media/presigned');
    assert.equal(calls[1].url, 'https://r2.test/upload');
    assert.equal(calls[1].options.method, 'PUT');
    assert.equal(calls[2].url, 'https://bff.test/api/v1/media/confirmar');
  });

  it('mantem presigned para imagem de story', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/api/v1/media/presigned')) {
        return {
          ok: true,
          json: async () => ({ dados: {
            uploadUrl: 'https://r2.test/upload',
            path: 'stories/user/incoming/media.webp',
            publicUrl: 'https://cdn.test/media.webp',
            token: 'confirm-token',
            expiresAt: '2026-06-19T12:00:00.000Z',
            mediaId: 'media-img-1',
          } }),
        };
      }
      if (url === 'https://r2.test/upload') return { ok: true, json: async () => ({}) };
      if (url.endsWith('/api/v1/media/confirmar')) return { ok: true, json: async () => ({ dados: { status: 'queued' } }) };
      throw new Error(`URL inesperada: ${url}`);
    };
    const { MediaP2P, FileMock } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['image'], 'story.webp', { type: 'image/webp' });

    await media.registrar(file, 'story-img');
    const result = await media.fazerUpload('story-img', 'stories');

    assert.equal(result.mediaId, 'media-img-1');
    assert.equal(calls[0].url, 'https://bff.test/api/v1/media/presigned');
    assert.equal(calls[1].url, 'https://r2.test/upload');
    assert.equal(calls[2].url, 'https://bff.test/api/v1/media/confirmar');
  });

  it('falha cedo quando envelope presigned nao contem mediaId ou path', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ dados: { uploadUrl: 'https://r2.test/upload', token: 'tok' } }),
    });
    const { MediaP2P, FileMock } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['video'], 'story.mp4', { type: 'video/mp4' });

    await media.registrar(file, 'story-2');

    await assert.rejects(
      () => media.fazerUpload('story-2', 'stories'),
      /Resposta invalida da BFF/,
    );
  });

  it('revoga o Blob URL pendente quando fazerUpload falha (qualquer etapa) — sem vazar memoria', async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith('/api/v1/media/presigned')) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    const { MediaP2P, FileMock, revoked } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['img'], 'servico.webp', { type: 'image/webp' });

    await media.registrar(file, 'falha-1');
    assert.equal(media.temPendente('falha-1'), true, 'deve haver pendente antes do upload falhar');

    await assert.rejects(
      () => media.fazerUpload('falha-1', 'services'),
      /Falha ao obter URL presigned/,
    );

    assert.deepEqual(revoked, ['blob:story'], 'Blob URL deve ser revogado mesmo com o upload falhando');
    assert.equal(media.temPendente('falha-1'), false, 'pendente deve ser removido do mapa apos a falha');
  });

  it('revoga o Blob URL quando o PUT ao R2 falha (etapa 2)', async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith('/api/v1/media/presigned')) {
        return {
          ok: true,
          json: async () => ({ dados: {
            uploadUrl: 'https://r2.test/upload',
            path: 'services/user/incoming/img.webp',
            publicUrl: 'https://cdn.test/img.webp',
            token: 'confirm-token',
            expiresAt: '2026-06-21T12:00:00.000Z',
            mediaId: 'media-2',
          } }),
        };
      }
      if (url === 'https://r2.test/upload') return { ok: false, status: 503 };
      throw new Error(`URL inesperada: ${url}`);
    };
    const { MediaP2P, FileMock, revoked } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['img'], 'servico.webp', { type: 'image/webp' });

    await media.registrar(file, 'falha-2');

    await assert.rejects(
      () => media.fazerUpload('falha-2', 'services'),
      /Falha no upload ao R2/,
    );

    assert.deepEqual(revoked, ['blob:story']);
    assert.equal(media.temPendente('falha-2'), false);
  });
});
