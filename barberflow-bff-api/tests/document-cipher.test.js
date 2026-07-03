'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// ── Garante que os testes usem a chave de dev (não exige env real) ──
process.env.NODE_ENV = 'test';

// Reseta o módulo para garantir que _key seja re-carregado com o env correto
let DocumentCipher;
before(() => {
  DocumentCipher = require('../infrastructure/crypto/DocumentCipher');
});

suite('DocumentCipher', () => {

  suite('encrypt / decrypt', () => {

    test('retorna string JSON compacta', () => {
      const enc = DocumentCipher.encrypt('12345678901');
      const parsed = JSON.parse(enc);
      assert.ok(parsed.v, 'campo v ausente');
      assert.ok(parsed.i, 'campo i ausente');
      assert.ok(parsed.t, 'campo t ausente');
    });

    test('round-trip CPF: decriptado é igual ao original', () => {
      const cpf = '12345678901';
      const enc = DocumentCipher.encrypt(cpf);
      assert.strictEqual(DocumentCipher.decrypt(enc), cpf);
    });

    test('round-trip CNPJ: decriptado é igual ao original', () => {
      const cnpj = '12345678000195';
      const enc = DocumentCipher.encrypt(cnpj);
      assert.strictEqual(DocumentCipher.decrypt(enc), cnpj);
    });

    test('cada encrypt gera ciphertext diferente (IV aleatório)', () => {
      const enc1 = DocumentCipher.encrypt('12345678901');
      const enc2 = DocumentCipher.encrypt('12345678901');
      assert.notStrictEqual(enc1, enc2);
    });

    test('decrypt lança erro para JSON adulterado', () => {
      const enc = DocumentCipher.encrypt('12345678901');
      const parsed = JSON.parse(enc);
      // Altera 1 char no ciphertext
      parsed.v = parsed.v.slice(0, -1) + (parsed.v.slice(-1) === 'A' ? 'B' : 'A');
      assert.throws(() => DocumentCipher.decrypt(JSON.stringify(parsed)));
    });

  });

  suite('tryDecrypt', () => {

    test('retorna null para null', () => {
      assert.strictEqual(DocumentCipher.tryDecrypt(null), null);
    });

    test('retorna null para string vazia', () => {
      assert.strictEqual(DocumentCipher.tryDecrypt(''), null);
    });

    test('retorna null para JSON corrompido (não lança)', () => {
      assert.strictEqual(DocumentCipher.tryDecrypt('not-json'), null);
    });

    test('retorna null para ciphertext adulterado (não lança)', () => {
      const enc = DocumentCipher.encrypt('12345678901');
      const parsed = JSON.parse(enc);
      parsed.v = (parsed.v[0] === 'A' ? 'B' : 'A') + parsed.v.slice(1);
      assert.strictEqual(DocumentCipher.tryDecrypt(JSON.stringify(parsed)), null);
    });

    test('retorna plaintext para valor válido', () => {
      const cpf = '11122233344';
      assert.strictEqual(DocumentCipher.tryDecrypt(DocumentCipher.encrypt(cpf)), cpf);
    });

  });

});
