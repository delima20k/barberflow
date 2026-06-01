'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const ProfissionalService = require('../services/ProfissionalService');

const CLIENT_ID  = '550e8400-e29b-41d4-a716-446655440000';
const PRO_ID     = '660e8400-e29b-41d4-a716-446655440001';
const IMAGE_ID   = '770e8400-e29b-41d4-a716-446655440002';
const SENDER_ID  = '880e8400-e29b-41d4-a716-446655440003';
const MSG_ID     = '990e8400-e29b-41d4-a716-446655440004';

function criarRepo(overrides = {}) {
  return {
    buscarContextoMensagem: async () => ({
      professional_id:   PRO_ID,
      owner_id:          PRO_ID,
      barbershop_id:     '010e8400-e29b-41d4-a716-446655440010',
      professional_name: 'Barbeiro Teste',
    }),
    salvarMensagemPortfolio: async () => {},
    listarMensagensPortfolioImagem: async () => ({
      ownerVerified: true,
      likesCount: 2,
      messages: [{
        id:        MSG_ID,
        body:      'Ficou ótimo!',
        createdAt: new Date().toISOString(),
        sender: { id: SENDER_ID, nome: 'Cliente', avatarPath: null },
      }],
    }),
    listarInteracoesPortfolio: async () => new Map(),
    ...overrides,
  };
}

suite('ProfissionalService – mensagens de portfólio (envio)', () => {
  test('deve salvar mensagem de portfólio com payload completo', async () => {
    let salvo = null;
    const service = new ProfissionalService(criarRepo({
      salvarMensagemPortfolio: async (payload) => { salvo = payload; },
    }), { execute: async () => ({ isFail: () => false, getValue: () => ({ id: 'x', body: 'Ficou ótimo!' }) }) });

    await service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
      body:            'Ficou ótimo!',
      portfolioImageId: IMAGE_ID,
    });

    assert.deepEqual(salvo, {
      portfolioImageId: IMAGE_ID,
      professionalId:   PRO_ID,
      senderId:         CLIENT_ID,
      body:             'Ficou ótimo!',
    });
  });

  test('deve rejeitar corpo vazio (body em branco) com erro 400', async () => {
    const service = new ProfissionalService(criarRepo());

    await assert.rejects(
      () => service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
        body:            '   ',
        portfolioImageId: IMAGE_ID,
      }),
      /Mensagem obrigatoria/i,
    );
  });

  test('deve rejeitar mensagem com mais de 240 caracteres', async () => {
    const service = new ProfissionalService(criarRepo());

    await assert.rejects(
      () => service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
        body:            'a'.repeat(241),
        portfolioImageId: IMAGE_ID,
      }),
      /Máximo/i,
    );
  });

  test('deve bloquear conteúdo moderado pela blocklist', async () => {
    const service = new ProfissionalService(criarRepo());

    await assert.rejects(
      () => service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
        body:            'puta merda esse corte',
        portfolioImageId: IMAGE_ID,
      }),
      /Mensagem nao permitida/i,
    );
  });

  test('deve aceitar emoji isolado como mensagem válida', async () => {
    let salvo = null;
    const service = new ProfissionalService(criarRepo({
      salvarMensagemPortfolio: async (payload) => { salvo = payload; },
    }), { execute: async () => ({ isFail: () => false, getValue: () => ({ id: 'x', body: '😂' }) }) });

    await service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
      body:            '😂',
      portfolioImageId: IMAGE_ID,
    });

    assert.equal(salvo.body, '😂');
  });

  test('deve aceitar mensagem no limite exato de 240 caracteres', async () => {
    // 'Corte incrivel!!' = 16 chars × 15 = 240 exatos; sem espaço final; sem char repetido 7+
    const corpo240 = 'Corte incrivel!!'.repeat(15);
    assert.equal(corpo240.length, 240);

    let salvo = null;
    const service = new ProfissionalService(criarRepo({
      salvarMensagemPortfolio: async (payload) => { salvo = payload; },
    }), { execute: async () => ({ isFail: () => false, getValue: () => ({ id: 'x', body: corpo240 }) }) });

    await service.iniciarMensagemBarbearia(CLIENT_ID, PRO_ID, {
      body:            corpo240,
      portfolioImageId: IMAGE_ID,
    });

    assert.equal(salvo.body.length, 240);
  });
});

suite('ProfissionalService – mensagens de portfólio (listagem)', () => {
  test('deve retornar messages e likesCount para o barbeiro dono', async () => {
    const service = new ProfissionalService(criarRepo());

    const dto = await service.listarMensagensPortfolioImagem(PRO_ID, IMAGE_ID);

    assert.equal(dto.likesCount, 2);
    assert.equal(dto.messages.length, 1);
    assert.equal(dto.messages[0].body, 'Ficou ótimo!');
    assert.ok(dto.messages[0].sender);
    assert.equal(dto.messages[0].sender.id, SENDER_ID);
  });

  test('deve retornar lista vazia e likesCount 0 quando não há mensagens', async () => {
    const service = new ProfissionalService(criarRepo({
      listarMensagensPortfolioImagem: async () => ({
        ownerVerified: true,
        likesCount:    0,
        messages:      [],
      }),
    }));

    const dto = await service.listarMensagensPortfolioImagem(PRO_ID, IMAGE_ID);

    assert.equal(dto.likesCount, 0);
    assert.deepEqual(dto.messages, []);
  });

  test('deve lançar 403 quando ownerVerified é false', async () => {
    const service = new ProfissionalService(criarRepo({
      listarMensagensPortfolioImagem: async () => ({
        ownerVerified: false,
        likesCount:    0,
        messages:      [],
      }),
    }));

    await assert.rejects(
      () => service.listarMensagensPortfolioImagem(CLIENT_ID, IMAGE_ID),
      /Acesso negado/i,
    );
  });

  test('deve formatar avatarUrl com base no SUPABASE_URL', async () => {
    const orig = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = 'https://xyz.supabase.co';

    const service = new ProfissionalService(criarRepo({
      listarMensagensPortfolioImagem: async () => ({
        ownerVerified: true,
        likesCount:    0,
        messages: [{
          id:        MSG_ID,
          body:      'Top',
          createdAt: new Date().toISOString(),
          sender:    { id: SENDER_ID, nome: 'Fulano', avatarPath: 'avatars/test.webp' },
        }],
      }),
    }));

    const dto = await service.listarMensagensPortfolioImagem(PRO_ID, IMAGE_ID);

    assert.ok(dto.messages[0].sender.avatarUrl?.startsWith('https://xyz.supabase.co'));
    process.env.SUPABASE_URL = orig;
  });

  test('deve retornar graciosamente (sem lançar) quando o repo falha', async () => {
    const service = new ProfissionalService(criarRepo({
      listarMensagensPortfolioImagem: async () => { throw new Error('DB offline'); },
    }));

    const dto = await service.listarMensagensPortfolioImagem(PRO_ID, IMAGE_ID);

    assert.equal(dto.likesCount, 0);
    assert.deepEqual(dto.messages, []);
  });
});
