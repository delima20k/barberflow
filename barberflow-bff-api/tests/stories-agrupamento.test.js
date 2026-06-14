'use strict';

/**
 * tests/stories-agrupamento.test.js
 *
 * TDD — Agrupamento de stories por barbershop_id.
 * Garante que o feed nunca cria 2 cards para a mesma barbearia,
 * mesmo quando dono e barbeiro parceiro postam vídeos.
 *
 * Camada testada: BarbeariaRepository.listarFeedStoriesAgrupados()
 * (regra de agrupamento já está na BFF — frontend consome dados pré-agrupados)
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaRepository = require('../repositories/BarbeariaRepository');

const SHOP_A   = '00000000-0000-4000-8001-aaaaaaaaaaaa';
const SHOP_B   = '00000000-0000-4000-8001-bbbbbbbbbbbb';
const OWNER_A  = '11111111-0000-4000-8001-111111111111'; // dono da barbearia A
const BARBER_A = '22222222-0000-4000-8001-222222222222'; // parceiro na barbearia A
const OWNER_B  = '33333333-0000-4000-8001-333333333333'; // dono da barbearia B

// Stories com barbershop_id distintos como owner_id para confirmar
// que o agrupamento ignora owner_id e usa apenas barbershop_id
const STORY_DONO_A   = { id: 's1', owner_id: OWNER_A,  barbershop_id: SHOP_A, media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString(), media_files: null };
const STORY_PARCEIRO = { id: 's2', owner_id: BARBER_A, barbershop_id: SHOP_A, media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date(Date.now() - 10000).toISOString(), media_files: null };
const STORY_B1       = { id: 's3', owner_id: OWNER_B,  barbershop_id: SHOP_B, media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date(Date.now() - 20000).toISOString(), media_files: null };
const STORY_B2       = { id: 's4', owner_id: OWNER_B,  barbershop_id: SHOP_B, media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date(Date.now() - 30000).toISOString(), media_files: null };
const STORY_B3       = { id: 's5', owner_id: OWNER_B,  barbershop_id: SHOP_B, media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date(Date.now() - 40000).toISOString(), media_files: null };
const STORY_SEM_SHOP = { id: 's6', owner_id: OWNER_A,  barbershop_id: null,   media_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString(), media_files: null };

/**
 * Cria um mock do cliente Supabase para o repositório.
 * Formato compatível com BarbeariaRepository.listarFeedStoriesAgrupados():
 *   stories:     from('stories').select().gt().order().limit()  → Promise
 *   barbershops: from('barbershops').select().in()              → Promise
 * @param {object[]} stories — stories a retornar na 1ª query
 * @param {object[]} shops   — barbershops a retornar na 2ª query
 */
function criarDbMock(stories, shops) {
  return {
    from: (table) => {
      if (table === 'stories') {
        return {
          select: () => ({
            gt: () => ({
              order: () => ({
                limit: async () => ({ data: stories, error: null }),
              }),
            }),
          }),
        };
      }
      // barbershops
      return {
        select: () => ({
          in: async () => ({ data: shops, error: null }),
        }),
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC1 — Dono + barbeiro parceiro na mesma barbearia → 1 único card
// ─────────────────────────────────────────────────────────────────────────────
suite('TC1: agrupamento por barbershop_id — dono + parceiro → 1 card', () => {
  test('deve retornar 1 grupo quando dono e parceiro postaram na mesma barbearia', async () => {
    const db = criarDbMock(
      [STORY_DONO_A, STORY_PARCEIRO],
      [{ id: SHOP_A, name: 'Barbearia Black', logo_path: null }],
    );
    const repo  = new BarbeariaRepository(db);
    const feed  = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed.length, 1, 'deve haver exatamente 1 grupo para SHOP_A');
    assert.strictEqual(feed[0].shop.id, SHOP_A);
    assert.strictEqual(feed[0].stories.length, 2, 'deve conter os 2 stories (dono + parceiro)');
  });

  test('os stories do grupo devem ter owner_id diferentes (dono e parceiro)', async () => {
    const db = criarDbMock(
      [STORY_DONO_A, STORY_PARCEIRO],
      [{ id: SHOP_A, name: 'Barbearia Black', logo_path: null }],
    );
    const repo   = new BarbeariaRepository(db);
    const feed   = await repo.listarFeedStoriesAgrupados();
    const owners = feed[0].stories.map(s => s.owner_id);

    assert.ok(owners.includes(OWNER_A),  'deve incluir o owner_id do dono');
    assert.ok(owners.includes(BARBER_A), 'deve incluir o owner_id do barbeiro parceiro');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC2 — 2 barbearias distintas → 2 cards separados
// ─────────────────────────────────────────────────────────────────────────────
suite('TC2: 2 barbearias distintas → 2 cards', () => {
  test('deve retornar 2 grupos para stories de barbearias diferentes', async () => {
    const db = criarDbMock(
      [STORY_DONO_A, STORY_B1],
      [
        { id: SHOP_A, name: 'Barbearia A', logo_path: null },
        { id: SHOP_B, name: 'Barbearia B', logo_path: null },
      ],
    );
    const repo = new BarbeariaRepository(db);
    const feed = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed.length, 2, 'deve haver 2 grupos distintos');
    const ids = feed.map(g => g.shop.id);
    assert.ok(ids.includes(SHOP_A), 'deve incluir SHOP_A');
    assert.ok(ids.includes(SHOP_B), 'deve incluir SHOP_B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC3 — Story sem barbershop_id não cria card fantasma
// ─────────────────────────────────────────────────────────────────────────────
suite('TC3: story sem barbershop_id ignorado', () => {
  test('deve ignorar stories com barbershop_id null — nao cria card fantasma', async () => {
    const db = criarDbMock(
      [STORY_SEM_SHOP],
      [],
    );
    const repo = new BarbeariaRepository(db);
    const feed = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed.length, 0, 'story sem barbershop_id nao deve gerar card');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC4 — Agrupamento usa barbershop_id, nunca owner_id
// ─────────────────────────────────────────────────────────────────────────────
suite('TC4: chave de agrupamento é barbershop_id', () => {
  test('2 stories de owners diferentes no mesmo shop → 1 grupo com shop.id correto', async () => {
    const db = criarDbMock(
      [STORY_DONO_A, STORY_PARCEIRO],
      [{ id: SHOP_A, name: 'Black', logo_path: null }],
    );
    const repo  = new BarbeariaRepository(db);
    const feed  = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed.length, 1);
    assert.strictEqual(feed[0].shop.id, SHOP_A, 'shop.id deve ser barbershop_id, nao owner_id');
    assert.notStrictEqual(feed[0].shop.id, OWNER_A, 'shop.id NAO deve ser owner_id do dono');
    assert.notStrictEqual(feed[0].shop.id, BARBER_A, 'shop.id NAO deve ser owner_id do parceiro');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC5 — Barbearia com 1 story → sem badge "+N"
// (contrato: array stories.length === 1 → sem badge no card)
// ─────────────────────────────────────────────────────────────────────────────
suite('TC5: 1 story por barbearia — sem badge de contagem', () => {
  test('deve retornar array de 1 story quando barbearia tem apenas 1 video', async () => {
    const db = criarDbMock(
      [STORY_DONO_A],
      [{ id: SHOP_A, name: 'Black', logo_path: null }],
    );
    const repo  = new BarbeariaRepository(db);
    const feed  = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed[0].stories.length, 1, 'deve ter exatamente 1 story no grupo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC6 — Barbearia com 3 stories → badge "+3"
// (contrato: array stories.length === 3 → card exibe "+3")
// ─────────────────────────────────────────────────────────────────────────────
suite('TC6: 3 stories por barbearia — badge de contagem correto', () => {
  test('deve retornar array de 3 stories quando barbearia tem 3 videos', async () => {
    const db = criarDbMock(
      [STORY_B1, STORY_B2, STORY_B3],
      [{ id: SHOP_B, name: 'Barbearia B', logo_path: null }],
    );
    const repo  = new BarbeariaRepository(db);
    const feed  = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(feed.length, 1);
    assert.strictEqual(feed[0].stories.length, 3, 'deve ter exatamente 3 stories no grupo (badge "+3")');
  });
});
