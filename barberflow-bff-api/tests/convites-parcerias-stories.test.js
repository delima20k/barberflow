'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');
const ConviteService = require('../services/ConviteService');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SHOP_ID = '00000000-0000-4000-8000-000000000002';
const INVITE_ID = '00000000-0000-4000-8000-000000000003';

suite('ConviteService - parcerias vinculadas', () => {
  test('lista somente barbearias vinculadas ativas do profissional', async () => {
    const service = new ConviteService({
      getConvites: async () => [],
      aceitarConvite: async () => ({ aceito: true }),
      recusarConvite: async () => ({ recusado: true }),
      listarBarbeariasVinculadas: async (profissionalId) => {
        assert.strictEqual(profissionalId, USER_ID);
        return [{ barbershop: { id: SHOP_ID, name: 'Barbearia Teste' } }];
      },
    });

    const result = await service.listarBarbeariasVinculadas(USER_ID);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].barbershop.id, SHOP_ID);
  });
});

suite('ConviteService - aceitar convite', () => {
  test('delega aceite para o repository para permitir reativacao de vinculo inativo', async () => {
    let chamado = false;
    const service = new ConviteService({
      getConvites: async () => [],
      listarBarbeariasVinculadas: async () => [],
      aceitarConvite: async (profissionalId, inviteId) => {
        chamado = true;
        assert.strictEqual(profissionalId, USER_ID);
        assert.strictEqual(inviteId, INVITE_ID);
        return { aceito: true, reativado: true };
      },
      recusarConvite: async () => ({ recusado: true }),
    });

    const result = await service.aceitarConvite(USER_ID, INVITE_ID);

    assert.strictEqual(chamado, true);
    assert.deepStrictEqual(result, { aceito: true, reativado: true });
  });
});

suite('BarbeariaService - stories de parceiro', () => {
  test('salva story de video quando profissional tem vinculo ativo e quota disponivel', async () => {
    let payloadSalvo = null;
    const service = new BarbeariaService({
      getAtivaPorOwner: async () => null,
      profissionalTemVinculoAtivo: async (barbershopId, profissionalId) => {
        assert.strictEqual(barbershopId, SHOP_ID);
        assert.strictEqual(profissionalId, USER_ID);
        return true;
      },
      contarStoriesAtivos: async () => 0,
      salvarStory: async (payload) => {
        payloadSalvo = payload;
        return { id: INVITE_ID, ...payload };
      },
    });

    const result = await service.salvarStoryProfissional(USER_ID, SHOP_ID, {
      storage_path: 'stories/pro/video.mp4',
      media_type: 'video',
      expires_at: '2026-05-27T00:00:00.000Z',
    });

    assert.strictEqual(result.storage_path, 'stories/pro/video.mp4');
    assert.strictEqual(payloadSalvo.owner_id, USER_ID);
  });

  test('bloqueia segundo story ativo para barbeiro parceiro', async () => {
    const service = new BarbeariaService({
      getAtivaPorOwner: async () => null,
      profissionalTemVinculoAtivo: async () => true,
      contarStoriesAtivos: async () => 1,
      salvarStory: async () => ({ id: INVITE_ID }),
    });

    await assert.rejects(
      () => service.salvarStoryProfissional(USER_ID, SHOP_ID, {
        storage_path: 'stories/pro/video.mp4',
        media_type: 'video',
      }),
      err => err.status === 409,
    );
  });
});
