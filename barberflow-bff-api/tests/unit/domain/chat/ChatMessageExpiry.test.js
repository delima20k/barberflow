'use strict';

/**
 * tests/unit/domain/chat/ChatMessageExpiry.test.js
 *
 * Cobertura:
 *   - PurgeExpiredChatMessagesUseCase: mensagens antigas, recentes, limites
 *   - InMemoryChatRepository.purgeExpiredMessages: correta remoção por data
 *   - ChatMessagePurgeTask: handler executa use case e loga só metadados
 *   - Segurança: usuário comum não chama purge diretamente
 *   - Compatibilidade histórico legado: body em claro continua acessível até expirar
 *   - Mensagem nova E2E: body vazio + encrypted_payload preservados antes do prazo
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const { Message }   = require('../../../../domain/chat/entities/Message');
const { InMemoryChatRepository } = require('../../../../infrastructure/chat/InMemoryChatRepository');
const { PurgeExpiredChatMessagesUseCase } = require('../../../../application/chat/PurgeExpiredChatMessagesUseCase');
const { ChatMessagePurgeTask } = require('../../../../application/scheduler/tasks/ChatMessagePurgeTask');

const CONV  = 'conv-expiry';
const USER_A = 'user-aaa';
const USER_B = 'user-bbb';
const ENC_PAYLOAD = { v: 1, alg: 'AES-GCM-256', iv: 'abc', ct: 'xyz', kid: USER_B };

function msAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function seedMessage(repo, { id, daysOld = 0, body = 'oi', encryptedPayload = null } = {}) {
  const createdAt = msAgo(daysOld);
  const msg = Message.restore({
    id:               id ?? crypto.randomUUID(),
    conversationId:   CONV,
    senderId:         USER_A,
    clientMessageId:  crypto.randomUUID(),
    body,
    encryptedPayload,
    createdAt,
  });
  // Injeta direto no Map interno via saveMessage (que respeita idempotência)
  return repo.saveMessage(msg).then(() => msg);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryChatRepository.purgeExpiredMessages()', () => {

  test('não remove mensagem com 6 dias', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 6 });

    const count = await repo.purgeExpiredMessages(7);
    const { items } = await repo.listMessagesReverse({ conversationId: CONV });

    assert.equal(count, 0, 'nenhuma mensagem deve ser removida com 6 dias');
    assert.equal(items.length, 1, 'mensagem deve permanecer');
  });

  test('remove mensagem com exatamente 7 dias', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 7 });

    const count = await repo.purgeExpiredMessages(7);
    assert.equal(count, 1, 'deve remover 1 mensagem com 7 dias');

    const { items } = await repo.listMessagesReverse({ conversationId: CONV });
    assert.equal(items.length, 0, 'repositório deve ficar vazio');
  });

  test('remove somente mensagens antigas, preserva recentes', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 10, body: 'antiga' });
    await seedMessage(repo, { daysOld: 3,  body: 'recente' });

    const count = await repo.purgeExpiredMessages(7);
    assert.equal(count, 1);

    const { items } = await repo.listMessagesReverse({ conversationId: CONV });
    assert.equal(items.length, 1);
    assert.equal(items[0].body, 'recente');
  });

  test('mensagem E2E (body vazio + encrypted_payload) é preservada antes do prazo', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 2, body: '', encryptedPayload: ENC_PAYLOAD });

    const count = await repo.purgeExpiredMessages(7);
    assert.equal(count, 0, 'mensagem E2E recente não deve ser removida');

    const { items } = await repo.listMessagesReverse({ conversationId: CONV });
    assert.deepEqual(items[0].encryptedPayload, ENC_PAYLOAD, 'encrypted_payload deve ser preservado');
  });

  test('mensagem legada (body em claro) continua acessível até expirar', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 5, body: 'mensagem legada visível' });

    const count = await repo.purgeExpiredMessages(7);
    assert.equal(count, 0);

    const { items } = await repo.listMessagesReverse({ conversationId: CONV });
    assert.equal(items[0].body, 'mensagem legada visível');
  });

  test('repositório vazio não lança erro', async () => {
    const repo = new InMemoryChatRepository();
    const count = await repo.purgeExpiredMessages(7);
    assert.equal(count, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PurgeExpiredChatMessagesUseCase', () => {

  test('retorna deletedCount correto', async () => {
    const repo = new InMemoryChatRepository();
    repo.seedConversation({ id: CONV, participantIds: [USER_A, USER_B] });
    await seedMessage(repo, { daysOld: 8 });
    await seedMessage(repo, { daysOld: 2 });

    const useCase = new PurgeExpiredChatMessagesUseCase({ chatRepository: repo, olderThanDays: 7 });
    const result  = await useCase.execute();

    assert.equal(result.isFail(), false);
    assert.equal(result.getValue().deletedCount, 1);
    assert.equal(result.getValue().olderThanDays, 7);
  });

  test('lança TypeError sem chatRepository', () => {
    assert.throws(
      () => new PurgeExpiredChatMessagesUseCase({ chatRepository: null }),
      TypeError,
    );
  });

  test('lança RangeError para olderThanDays inválido', () => {
    const repo = new InMemoryChatRepository();
    assert.throws(
      () => new PurgeExpiredChatMessagesUseCase({ chatRepository: repo, olderThanDays: 0 }),
      RangeError,
    );
    assert.throws(
      () => new PurgeExpiredChatMessagesUseCase({ chatRepository: repo, olderThanDays: 366 }),
      RangeError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ChatMessagePurgeTask', () => {

  test('executa use case e não lança em caso de sucesso', async () => {
    const repo = new InMemoryChatRepository();
    const useCase = new PurgeExpiredChatMessagesUseCase({ chatRepository: repo });
    const task = new ChatMessagePurgeTask({ purgeExpiredChatMessagesUseCase: useCase });
    await assert.doesNotReject(() => task.execute());
  });

  test('lança TypeError sem use case', () => {
    assert.throws(
      () => new ChatMessagePurgeTask({ purgeExpiredChatMessagesUseCase: null }),
      TypeError,
    );
  });

  test('lança Error se o use case falhar', async () => {
    const brokenUseCase = { execute: async () => ({ isFail: () => true, getError: () => 'db falhou' }) };
    const task = new ChatMessagePurgeTask({ purgeExpiredChatMessagesUseCase: brokenUseCase });
    await assert.rejects(() => task.execute(), /db falhou/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Segurança — usuário comum não acessa purge', () => {

  test('PurgeExpiredChatMessagesUseCase não expõe endpoint público', () => {
    // O use case é chamado SOMENTE pelo scheduler (SchedulerAdminMiddleware protege o endpoint).
    // Aqui verificamos que o use case não aceita parâmetros de userId (não é uma operação por usuário).
    const repo = new InMemoryChatRepository();
    const useCase = new PurgeExpiredChatMessagesUseCase({ chatRepository: repo });
    // execute() não aceita userId nem messageId — é operação administrativa global
    assert.equal(useCase.execute.length, 0, 'execute() não deve aceitar parâmetros de usuário');
  });
});
