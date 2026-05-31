'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const { Result } = require('../domain/shared/Result');
const ProfissionalRepository = require('../repositories/ProfissionalRepository');
const ProfissionalService = require('../services/ProfissionalService');

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROF_ID = '660e8400-e29b-41d4-a716-446655440001';
const SHOP_ID = '770e8400-e29b-41d4-a716-446655440002';
const OWNER_ID = '880e8400-e29b-41d4-a716-446655440003';
const CONV_ID = '990e8400-e29b-41d4-a716-446655440004';

function criarRepo(overrides = {}) {
  return {
    buscarPerfilPublico: async () => ({
      id: PROF_ID,
      full_name: 'Joao Navalha',
      avatar_path: 'avatars/joao.webp',
      bio: 'Cortes classicos e degrade.',
      rating_avg: 4.8,
      rating_count: 42,
      birth_date: '1998-05-12',
      gender: 'masculino',
      since_year: 2012,
      barbershop_id: SHOP_ID,
      barbershop_name: 'Barbearia Prime',
      barbershop_address: 'Rua XPTO, 123',
      barbershop_city: 'Sao Paulo',
      barbershop_state: 'SP',
      barbershop_owner_id: OWNER_ID,
      barbershop_logo_path: `${SHOP_ID}/logo.webp`,
      barbershop_cover_path: `${SHOP_ID}/cover.webp`,
      barbershop_is_owner_workplace: false,
    }),
    atualizarPerfilPublico: async (_userId, payload) => ({ id: _userId, ...payload }),
    buscarContextoMensagem: async () => ({
      professional_id: PROF_ID,
      professional_name: 'Joao Navalha',
      barbershop_id: SHOP_ID,
      barbershop_name: 'Barbearia Prime',
      owner_id: OWNER_ID,
    }),
    encontrarConversaDireta: async () => null,
    criarConversaDireta: async () => CONV_ID,
    ...overrides,
  };
}

suite('ProfissionalService - perfil publico', () => {
  test('deve montar DTO publico completo do barbeiro', async () => {
    const service = new ProfissionalService(criarRepo(), { execute: async () => Result.ok({}) });

    const dto = await service.buscarPerfilPublico(PROF_ID);

    assert.deepEqual(dto, {
      id: PROF_ID,
      fullName: 'Joao Navalha',
      avatarPath: 'avatars/joao.webp',
      bio: 'Cortes classicos e degrade.',
      ratingAvg: 4.8,
      ratingCount: 42,
      birthDate: '1998-05-12',
      gender: 'masculino',
      sinceYear: 2012,
      barbershop: {
        id: SHOP_ID,
        name: 'Barbearia Prime',
        address: 'Rua XPTO, 123',
        city: 'Sao Paulo',
        state: 'SP',
        ownerId: OWNER_ID,
        logoPath: `${SHOP_ID}/logo.webp`,
        coverPath: `${SHOP_ID}/cover.webp`,
        isOwnerWorkplace: false,
        professionalId: PROF_ID,
      },
    });
  });

  test('deve expor barbearia propria do dono como workplace principal', async () => {
    const service = new ProfissionalService(
      criarRepo({
        buscarPerfilPublico: async () => ({
          id: PROF_ID,
          full_name: 'Aln1',
          avatar_path: null,
          bio: 'Dono e barbeiro.',
          rating_avg: 5,
          rating_count: 8,
          birth_date: null,
          gender: null,
          since_year: 2010,
          barbershop_id: SHOP_ID,
          barbershop_name: 'Barbearia Aln1',
          barbershop_address: 'Rua Central',
          barbershop_city: 'Sao Paulo',
          barbershop_state: 'SP',
          barbershop_owner_id: PROF_ID,
          barbershop_logo_path: `${SHOP_ID}/logo.webp`,
          barbershop_cover_path: `${SHOP_ID}/cover.webp`,
          barbershop_is_owner_workplace: true,
        }),
      }),
      { execute: async () => Result.ok({}) },
    );

    const dto = await service.buscarPerfilPublico(PROF_ID);

    assert.deepEqual(dto.barbershop, {
      id: SHOP_ID,
      name: 'Barbearia Aln1',
      address: 'Rua Central',
      city: 'Sao Paulo',
      state: 'SP',
      ownerId: PROF_ID,
      logoPath: `${SHOP_ID}/logo.webp`,
      coverPath: `${SHOP_ID}/cover.webp`,
      isOwnerWorkplace: true,
      professionalId: PROF_ID,
    });
  });

  test('deve retornar 404 quando barbeiro nao existe', async () => {
    const service = new ProfissionalService(
      criarRepo({ buscarPerfilPublico: async () => null }),
      { execute: async () => Result.ok({}) },
    );

    await assert.rejects(
      () => service.buscarPerfilPublico(PROF_ID),
      err => err.status === 404,
    );
  });

  test('deve validar sinceYear entre 1950 e ano atual', async () => {
    const service = new ProfissionalService(criarRepo(), { execute: async () => Result.ok({}) });

    await assert.rejects(
      () => service.atualizarPerfilPublico(USER_ID, { sinceYear: 1949 }),
      err => err.status === 400,
    );
  });

  test('deve atualizar sinceYear, birthDate e gender com allowlist', async () => {
    const recebidos = [];
    const service = new ProfissionalService(
      criarRepo({
        atualizarPerfilPublico: async (userId, payload) => {
          recebidos.push({ userId, payload });
          return { id: userId, ...payload };
        },
      }),
      { execute: async () => Result.ok({}) },
      { now: () => new Date('2026-05-25T12:00:00Z') },
    );

    const resultado = await service.atualizarPerfilPublico(USER_ID, {
      sinceYear: 2015,
      birthDate: '1998-05-12',
      gender: 'masculino',
      role: 'admin',
    });

    assert.deepEqual(recebidos[0], {
      userId: USER_ID,
      payload: { since_year: 2015, birth_date: '1998-05-12', gender: 'masculino' },
    });
    assert.deepEqual(resultado, { sinceYear: 2015, birthDate: '1998-05-12', gender: 'masculino' });
  });

  test('deve criar conversa com dono da barbearia e enviar mensagem inicial', async () => {
    const envios = [];
    const service = new ProfissionalService(
      criarRepo(),
      {
        execute: async command => {
          envios.push(command);
          return Result.ok({ id: 'msg-1', conversationId: command.conversationId });
        },
      },
      { uuid: () => 'client-message-id-1' },
    );

    const resultado = await service.iniciarMensagemBarbearia(USER_ID, PROF_ID);

    assert.strictEqual(resultado.conversationId, CONV_ID);
    assert.deepEqual(envios[0], {
      conversationId: CONV_ID,
      senderId: USER_ID,
      clientMessageId: 'client-message-id-1',
      body: 'Cliente interessado no barbeiro Joao Navalha',
      attachments: [],
    });
  });
});

suite('ProfissionalRepository - perfil publico resiliente a 42P01', () => {
  test('deve retornar perfil parcial quando tabela professionals retorna 42P01 nas duas queries', async () => {
    const db = {
      from(table) {
        const state = { table, select: '' };
        const query = {
          select(value) { state.select = value; return query; },
          eq() { return query; },
          order() { return query; },
          limit() { return query; },
          maybeSingle() {
            if (state.table === 'profiles') {
              return Promise.resolve({
                data: { id: PROF_ID, full_name: 'Joao', avatar_path: null, is_active: true },
                error: null,
              });
            }
            if (state.table === 'professionals') {
              return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "professionals" does not exist' } });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const repo = new ProfissionalRepository(db);
    const row = await repo.buscarPerfilPublico(PROF_ID);
    assert.ok(row, 'deve preservar perfil publico parcial quando profiles existe');
    assert.strictEqual(row.id, PROF_ID);
    assert.strictEqual(row.full_name, 'Joao');
    assert.strictEqual(row.barbershop_id, null);
  });

  test('deve retornar perfil sem barbearia quando professional_shop_links retorna 42P01', async () => {
    const db = {
      from(table) {
        const state = { table, select: '' };
        const query = {
          select(value) { state.select = value; return query; },
          eq() { return query; },
          order() { return query; },
          limit() { return query; },
          maybeSingle() {
            if (state.table === 'profiles') {
              return Promise.resolve({
                data: { id: PROF_ID, full_name: 'Joao', avatar_path: null, is_active: true },
                error: null,
              });
            }
            if (state.table === 'professionals') {
              return Promise.resolve({
                data: { id: PROF_ID, bio: 'Bio', avatar_path: null, rating_avg: 5, rating_count: 1, is_active: true },
                error: null,
              });
            }
            if (state.table === 'professional_shop_links') {
              return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "professional_shop_links" does not exist' } });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const repo = new ProfissionalRepository(db);
    const row = await repo.buscarPerfilPublico(PROF_ID);
    assert.ok(row, 'deve retornar perfil mesmo sem barbearia vinculada');
    assert.strictEqual(row.barbershop_id, null);
  });
});

suite('ProfissionalRepository - perfil publico resiliente a schema parcial', () => {
  test('deve retornar perfil publico quando colunas novas ainda nao existem no banco', async () => {
    const calls = [];
    const db = {
      from(table) {
        const state = { table, select: '' };
        const query = {
          select(value) {
            state.select = value;
            calls.push({ table, select: value });
            return query;
          },
          eq() { return query; },
          order() { return query; },
          limit() { return query; },
          maybeSingle() {
            if (state.table === 'profiles' && state.select.includes('birth_date')) {
              return Promise.resolve({ data: null, error: { code: '42703', message: 'column profiles.birth_date does not exist' } });
            }
            if (state.table === 'profiles') {
              return Promise.resolve({
                data: { id: PROF_ID, full_name: 'Joao Navalha', avatar_path: 'avatars/joao.webp', is_active: true },
                error: null,
              });
            }
            if (state.table === 'professionals' && state.select.includes('since_year')) {
              return Promise.resolve({ data: null, error: { code: '42703', message: 'column professionals.since_year does not exist' } });
            }
            if (state.table === 'professionals') {
              return Promise.resolve({
                data: { id: PROF_ID, bio: 'Cortes classicos.', avatar_path: null, rating_avg: 4.5, rating_count: 3, is_active: true },
                error: null,
              });
            }
            if (state.table === 'professional_shop_links' && state.select.includes('joined_at')) {
              return Promise.resolve({ data: null, error: { code: '42703', message: 'column professional_shop_links.joined_at does not exist' } });
            }
            if (state.table === 'professional_shop_links') {
              return Promise.resolve({ data: { barbershop_id: SHOP_ID }, error: null });
            }
            if (state.table === 'barbershops' && state.select.includes('state')) {
              return Promise.resolve({ data: null, error: { code: '42703', message: 'column barbershops.state does not exist' } });
            }
            if (state.table === 'barbershops') {
              return Promise.resolve({
                data: { id: SHOP_ID, owner_id: OWNER_ID, name: 'Barbearia Prime', address: 'Rua XPTO, 123', city: 'Sao Paulo', is_active: true },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const repo = new ProfissionalRepository(db);
    const row = await repo.buscarPerfilPublico(PROF_ID);

    assert.equal(row.id, PROF_ID);
    assert.equal(row.birth_date, null);
    assert.equal(row.gender, null);
    assert.equal(row.since_year, null);
    assert.equal(row.barbershop_state, null);
    assert.ok(calls.some(call => call.table === 'profiles' && !call.select.includes('birth_date')));
    assert.ok(calls.some(call => call.table === 'professionals' && !call.select.includes('since_year')));
  });

  test('deve priorizar barbearia propria antes de parceria ativa no perfil publico', async () => {
    const calls = [];
    const db = {
      from(table) {
        const state = { table, select: '', filters: [] };
        const query = {
          select(value) {
            state.select = value;
            calls.push({ table, select: value });
            return query;
          },
          eq(col, value) { state.filters.push([col, value]); return query; },
          order() { return query; },
          limit() { return query; },
          maybeSingle() {
            if (state.table === 'profiles') {
              return Promise.resolve({
                data: { id: PROF_ID, full_name: 'Aln1', avatar_path: null, is_active: true },
                error: null,
              });
            }
            if (state.table === 'professionals') {
              return Promise.resolve({
                data: { id: PROF_ID, bio: 'Dono', avatar_path: null, rating_avg: 5, rating_count: 1, is_active: true },
                error: null,
              });
            }
            if (state.table === 'barbershops' && state.filters.some(([col]) => col === 'owner_id')) {
              return Promise.resolve({
                data: {
                  id: SHOP_ID,
                  owner_id: PROF_ID,
                  name: 'Barbearia Aln1',
                  address: 'Rua Central',
                  city: 'Sao Paulo',
                  state: 'SP',
                  logo_path: `${SHOP_ID}/logo.webp`,
                  cover_path: `${SHOP_ID}/cover.webp`,
                  is_active: true,
                },
                error: null,
              });
            }
            if (state.table === 'professional_shop_links') {
              return Promise.resolve({
                data: { barbershop_id: '11111111-1111-4111-8111-111111111111' },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      },
    };

    const repo = new ProfissionalRepository(db);
    const row = await repo.buscarPerfilPublico(PROF_ID);

    assert.equal(row.barbershop_id, SHOP_ID);
    assert.equal(row.barbershop_is_owner_workplace, true);
    assert.equal(row.barbershop_logo_path, `${SHOP_ID}/logo.webp`);
    assert.ok(calls.some(call => call.table === 'barbershops' && call.select.includes('logo_path')));
  });
});
