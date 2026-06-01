'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');
const AppError = require('../utils/AppError');

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_ID = '20000000-0000-4000-8000-000000000002';
const SHOP_ID = '30000000-0000-4000-8000-000000000003';

function criarRepo({ shop = { id: SHOP_ID, owner_id: OWNER_ID, name: 'Barbearia Central' }, conversationId = 'conv-1' } = {}) {
  const chamadas = [];
  return {
    chamadas,
    getAtivaPorId: async (barbershopId) => {
      chamadas.push(['getAtivaPorId', barbershopId]);
      return shop;
    },
    encontrarConversaDireta: async (userId, ownerId) => {
      chamadas.push(['encontrarConversaDireta', userId, ownerId]);
      return conversationId;
    },
    criarConversaDireta: async (payload) => {
      chamadas.push(['criarConversaDireta', payload]);
      return 'conv-1';
    },
  };
}

function criarSendMessageUseCase() {
  const chamadas = [];
  return {
    chamadas,
    execute: async (command) => {
      chamadas.push(command);
      return {
        isFail: () => false,
        getValue: () => ({
          id: 'msg-1',
          conversationId: command.conversationId,
          senderId: command.senderId,
          clientMessageId: command.clientMessageId,
          body: command.body,
        }),
      };
    },
  };
}

suite('BarbeariaService.enviarInteresseMensalidade', () => {
  test('cria ou reutiliza conversa e envia mensagem pelo chat canonico', async () => {
    const repo = criarRepo({ conversationId: null });
    const useCase = criarSendMessageUseCase();
    const service = new BarbeariaService(repo, useCase);

    const result = await service.enviarInteresseMensalidade(USER_ID, SHOP_ID, {
      clientMessageId: 'mensalidade:test-1',
      planName: 'Plano Mensalidade',
      monthlyPrice: 149.9,
    });

    assert.equal(result.conversationId, 'conv-1');
    assert.equal(useCase.chamadas[0].senderId, USER_ID);
    assert.equal(useCase.chamadas[0].conversationId, 'conv-1');
    assert.equal(useCase.chamadas[0].clientMessageId, 'mensalidade:test-1');
    assert.match(useCase.chamadas[0].body, /Tenho interesse no plano de mensalidade/);
    assert.match(useCase.chamadas[0].body, /Barbearia Central/);
    assert.match(useCase.chamadas[0].body, /R\$ 149,90/);
    assert.equal(repo.chamadas.some(([nome]) => nome === 'criarConversaDireta'), true);
  });

  test('reutiliza conversa existente sem criar duplicada', async () => {
    const repo = criarRepo({ conversationId: 'conv-existente' });
    const useCase = criarSendMessageUseCase();
    const service = new BarbeariaService(repo, useCase);

    const result = await service.enviarInteresseMensalidade(USER_ID, SHOP_ID, {
      clientMessageId: 'mensalidade:test-2',
    });

    assert.equal(result.conversationId, 'conv-existente');
    assert.equal(repo.chamadas.some(([nome]) => nome === 'criarConversaDireta'), false);
  });

  test('rejeita barbearia ausente ou inativa', async () => {
    const service = new BarbeariaService(criarRepo({ shop: null }), criarSendMessageUseCase());

    await assert.rejects(
      () => service.enviarInteresseMensalidade(USER_ID, SHOP_ID, { clientMessageId: 'mensalidade:test-3' }),
      (err) => err instanceof AppError && err.status === 404,
    );
  });

  test('rejeita auto mensagem para propria barbearia', async () => {
    const service = new BarbeariaService(
      criarRepo({ shop: { id: SHOP_ID, owner_id: USER_ID, name: 'Minha Barbearia' } }),
      criarSendMessageUseCase(),
    );

    await assert.rejects(
      () => service.enviarInteresseMensalidade(USER_ID, SHOP_ID, { clientMessageId: 'mensalidade:test-4' }),
      (err) => err instanceof AppError && err.status === 409,
    );
  });

  test('nao envia mensagem sem clientMessageId idempotente', async () => {
    const service = new BarbeariaService(criarRepo(), criarSendMessageUseCase());

    await assert.rejects(
      () => service.enviarInteresseMensalidade(USER_ID, SHOP_ID, {}),
      (err) => err instanceof AppError && err.status === 400,
    );
  });
});
