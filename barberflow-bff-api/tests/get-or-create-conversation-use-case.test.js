'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { GetOrCreateConversationUseCase } = require('../application/chat/GetOrCreateConversationUseCase');

// ── Fakes ─────────────────────────────────────────────────────

class FakeChatRepository {
  #existingConvId;
  #created = false;
  constructor(existingConvId = null) { this.#existingConvId = existingConvId; }
  get wasCreated() { return this.#created; }
  async findOrCreateDirect(userA, userB) {
    this.#created = !this.#existingConvId;
    return { id: this.#existingConvId ?? `new-conv-${userA}-${userB}`, type: 'direct' };
  }
}

class FakeBlockPolicyAllow {
  async canExchange() { return true; }
}
class FakeBlockPolicyDeny {
  async canExchange() { return false; }
}

// ── Testes ─────────────────────────────────────────────────────

describe('GetOrCreateConversationUseCase', () => {

  test('rejeita sem requesterId', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository(),
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ targetUserId: 'user-b' });
    assert.equal(r.ok, false);
  });

  test('rejeita sem targetUserId', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository(),
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ requesterId: 'user-a' });
    assert.equal(r.ok, false);
  });

  test('rejeita auto-conversa (requesterId === targetUserId)', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository(),
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ requesterId: 'same-id', targetUserId: 'same-id' });
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('consigo mesmo') || r.error.length > 0);
  });

  test('rejeita quando blockPolicy retorna false', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository(),
      blockPolicy: new FakeBlockPolicyDeny(),
    });
    const r = await uc.execute({ requesterId: 'user-a', targetUserId: 'user-b' });
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('bloqueado') || r.error.length > 0);
  });

  test('retorna ID de conversa existente', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository('existing-conv-123'),
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ requesterId: 'user-a', targetUserId: 'user-b' });
    assert.equal(r.ok, true);
    assert.equal(r.value.id, 'existing-conv-123');
  });

  test('cria nova conversa quando não existe', async () => {
    const repo = new FakeChatRepository(null);
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: repo,
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ requesterId: 'user-a', targetUserId: 'user-b' });
    assert.equal(r.ok, true);
    assert.ok(r.value.id, 'deve retornar ID da nova conversa');
    assert.equal(repo.wasCreated, true);
  });

  test('retorna type: direct', async () => {
    const uc = new GetOrCreateConversationUseCase({
      chatRepository: new FakeChatRepository('conv-x'),
      blockPolicy: new FakeBlockPolicyAllow(),
    });
    const r = await uc.execute({ requesterId: 'user-a', targetUserId: 'user-b' });
    assert.equal(r.value.type, 'direct');
  });

  test('lança se chatRepository não for fornecido', () => {
    assert.throws(
      () => new GetOrCreateConversationUseCase({ blockPolicy: new FakeBlockPolicyAllow() }),
      /obrigatorio/i
    );
  });

  test('lança se blockPolicy não for fornecido', () => {
    assert.throws(
      () => new GetOrCreateConversationUseCase({ chatRepository: new FakeChatRepository() }),
      /obrigatorio/i
    );
  });
});
