'use strict';

/**
 * tests/unit/domain/chat/UserKey.test.js
 *
 * Cobre o registro/leitura de chaves públicas ECDH (E2EE do chat):
 *   - RegisterUserKeyUseCase: upsert + validação de tamanho
 *   - GetUserKeyUseCase: leitura + falha quando peer não tem chave
 *   - SupabaseUserKeyRepository: upsert escreve só user_id + public_key
 *     (NUNCA chave privada) com onConflict 'user_id'
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { RegisterUserKeyUseCase } = require('../../../../application/chat/RegisterUserKeyUseCase');
const { GetUserKeyUseCase } = require('../../../../application/chat/GetUserKeyUseCase');
const { SupabaseUserKeyRepository } = require('../../../../infrastructure/chat/SupabaseUserKeyRepository');

const PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' + 'a'.repeat(80); // ~116 chars (válida)

// ─────────────────────────────────────────────────────────────────────────────

describe('RegisterUserKeyUseCase', () => {

  test('faz upsert da chave pública', async () => {
    const chamadas = [];
    const repo = { upsert: async (userId, publicKey) => { chamadas.push({ userId, publicKey }); } };
    const useCase = new RegisterUserKeyUseCase({ userKeyRepository: repo });

    const result = await useCase.execute({ userId: 'user-a', publicKey: PUBLIC_KEY });

    assert.equal(result.isFail(), false);
    assert.equal(chamadas.length, 1);
    assert.deepEqual(chamadas[0], { userId: 'user-a', publicKey: PUBLIC_KEY });
  });

  test('rejeita quando publicKey ausente', async () => {
    const repo = { upsert: async () => { throw new Error('não deveria chamar'); } };
    const useCase = new RegisterUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ userId: 'user-a', publicKey: null });
    assert.equal(result.isFail(), true);
  });

  test('rejeita publicKey curta (< 50 chars)', async () => {
    const repo = { upsert: async () => { throw new Error('não deveria chamar'); } };
    const useCase = new RegisterUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ userId: 'user-a', publicKey: 'curta' });
    assert.equal(result.isFail(), true);
    assert.match(result.getError(), /SPKI|inval/i);
  });

  test('rejeita publicKey longa (> 2048 chars)', async () => {
    const repo = { upsert: async () => { throw new Error('não deveria chamar'); } };
    const useCase = new RegisterUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ userId: 'user-a', publicKey: 'x'.repeat(3000) });
    assert.equal(result.isFail(), true);
  });

  test('lança TypeError sem repositório', () => {
    assert.throws(() => new RegisterUserKeyUseCase({ userKeyRepository: null }), TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GetUserKeyUseCase', () => {

  test('retorna a chave pública quando existe', async () => {
    const repo = { findByUserId: async () => ({ userId: 'peer-b', publicKey: PUBLIC_KEY }) };
    const useCase = new GetUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ targetUserId: 'peer-b' });
    assert.equal(result.isFail(), false);
    assert.equal(result.getValue().publicKey, PUBLIC_KEY);
  });

  test('falha quando peer não tem chave registrada', async () => {
    const repo = { findByUserId: async () => null };
    const useCase = new GetUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ targetUserId: 'peer-sem-chave' });
    assert.equal(result.isFail(), true);
    assert.match(result.getError(), /não encontrada|nao encontrada/i);
  });

  test('falha sem targetUserId', async () => {
    const repo = { findByUserId: async () => null };
    const useCase = new GetUserKeyUseCase({ userKeyRepository: repo });
    const result  = await useCase.execute({ targetUserId: null });
    assert.equal(result.isFail(), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SupabaseUserKeyRepository.upsert', () => {

  test('escreve apenas user_id e public_key, com onConflict user_id', async () => {
    let capturado = null;
    const db = {
      from: (tabela) => {
        capturado = { tabela };
        return {
          upsert: (payload, opts) => {
            capturado.payload = payload;
            capturado.opts = opts;
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const repo = new SupabaseUserKeyRepository(db);
    await repo.upsert('user-a', PUBLIC_KEY);

    assert.equal(capturado.tabela, 'user_keys');
    assert.deepEqual(capturado.payload, { user_id: 'user-a', public_key: PUBLIC_KEY });
    assert.deepEqual(capturado.opts, { onConflict: 'user_id' });
    // Garantia de segurança: nenhuma coluna de chave privada é escrita
    assert.deepEqual(Object.keys(capturado.payload).sort(), ['public_key', 'user_id']);
  });

  test('propaga erro do banco', async () => {
    const db = {
      from: () => ({ upsert: async () => ({ error: { message: 'falha db', code: '500' } }) }),
    };
    const repo = new SupabaseUserKeyRepository(db);
    await assert.rejects(() => repo.upsert('user-a', PUBLIC_KEY), /falha db/);
  });

  test('findByUserId retorna chave normalizada', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { user_id: 'peer-b', public_key: PUBLIC_KEY }, error: null }),
          }),
        }),
      }),
    };
    const repo = new SupabaseUserKeyRepository(db);
    const found = await repo.findByUserId('peer-b');
    assert.deepEqual(found, { userId: 'peer-b', publicKey: PUBLIC_KEY });
  });
});
