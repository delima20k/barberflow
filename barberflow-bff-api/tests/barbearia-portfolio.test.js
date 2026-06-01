'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');

const SHOP_ID = '550e8400-e29b-41d4-a716-446655440000';
const OWNER_ID = '660e8400-e29b-41d4-a716-446655440001';
const PARTNER_ID = '770e8400-e29b-41d4-a716-446655440002';
const OTHER_ID = '880e8400-e29b-41d4-a716-446655440003';

suite('BarbeariaService - portfolio agregado', () => {
  test('lista portfolio do dono e parceiros ativos da mesma barbearia', async () => {
    let idsRecebidos = null;
    const service = new BarbeariaService({
      getAtivaPorId: async () => ({ id: SHOP_ID, owner_id: OWNER_ID }),
      getProfessionalIdsAtivos: async () => [PARTNER_ID, OTHER_ID],
      getProfilesByIds: async () => [
        { id: OWNER_ID, full_name: 'Aln1', avatar_path: 'owner-avatar.webp' },
        { id: PARTNER_ID, full_name: 'Lima', avatar_path: 'lima-avatar.webp' },
      ],
      listarPortfolioAgregado: async (_shopId, professionalIds) => {
        idsRecebidos = professionalIds;
        return {
          items: [
            { id: 'img-owner', owner_id: OWNER_ID, owner_type: 'professional', thumbnail_path: 'owner.webp', likes_count: 3 },
            { id: 'img-partner', owner_id: PARTNER_ID, owner_type: 'professional', thumbnail_path: 'partner.webp', likes_count: 2 },
          ],
          total: 2,
        };
      },
    });

    const dto = await service.listarPortfolio(SHOP_ID, { limit: 30, offset: 0 });

    assert.deepEqual(idsRecebidos, [OWNER_ID, PARTNER_ID, OTHER_ID]);
    assert.deepEqual(dto.items.map(item => item.ownerId), [OWNER_ID, PARTNER_ID]);
    assert.deepEqual(dto.items.map(item => item.professionalName), ['Aln1', 'Lima']);
    assert.deepEqual(dto.items.map(item => item.professionalAvatarPath), ['owner-avatar.webp', 'lima-avatar.webp']);
    assert.equal(dto.total, 2);
  });

  test('rejeita barbearia inexistente antes de listar portfolio', async () => {
    const service = new BarbeariaService({
      getAtivaPorId: async () => null,
    });

    await assert.rejects(
      () => service.listarPortfolio(SHOP_ID, { limit: 30 }),
      /Barbearia nao encontrada/,
    );
  });
});
