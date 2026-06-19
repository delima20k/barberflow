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

  const sandbox = vm.createContext({
    File: FileMock,
    URL: {
      createObjectURL: () => 'blob:story',
      revokeObjectURL: () => {},
    },
    window: { BFF_URL: 'https://bff.test', confirm: () => true },
    fetch: fetchImpl,
    SupabaseService: {
      getSession: async () => ({ access_token: 'jwt-test' }),
    },
  });
  carregar(sandbox, 'shared/js/MediaP2P.js');
  return { MediaP2P: sandbox.MediaP2P, FileMock };
}

describe('MediaP2P', () => {
  it('usa presigned para story video e nao chama rota sincrona comprimida', async () => {
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
            expiresAt: '2026-06-19T12:00:00.000Z',
            mediaId: 'media-1',
          } }),
        };
      }
      if (url === 'https://r2.test/upload') {
        return { ok: true, json: async () => ({}) };
      }
      if (url.endsWith('/api/v1/media/confirmar')) {
        return { ok: true, json: async () => ({ dados: { status: 'queued' } }) };
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    const { MediaP2P, FileMock } = carregarMediaP2P(fetchImpl);
    const media = new MediaP2P();
    const file = new FileMock(['video'], 'story.mp4', { type: 'video/mp4' });

    await media.registrar(file, 'story-1');
    const result = await media.fazerUpload('story-1', 'stories', { barbershopId: 'shop-1' });

    assert.equal(result.mediaId, 'media-1');
    assert.equal(calls.some(call => call.url.includes('/stories/upload-compressed')), false);
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
});
