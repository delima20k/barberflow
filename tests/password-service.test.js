'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Testes: PasswordService
// Framework: node:test + node:assert/strict
// Cobre: validarForca, hash, verificar
// ─────────────────────────────────────────────────────────────────────────────

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const path             = require('node:path');

// 4 rounds para testes rápidos (bcrypt é O(2^rounds))
process.env.BCRYPT_ROUNDS = '4';

const PasswordService = require(path.join(__dirname, '..', 'src', 'infra', 'PasswordService'));

// ─────────────────────────────────────────────────────────────────────────────
// validarForca
// ─────────────────────────────────────────────────────────────────────────────

describe('PasswordService.validarForca()', () => {

  it('senha válida retorna { ok: true, msg: "" }', () => {
    const result = PasswordService.validarForca('Senh@Valida1');
    assert.equal(result.ok,  true);
    assert.equal(result.msg, '');
  });

  it('senha com 8 chars exatos (limite mínimo) é válida', () => {
    const result = PasswordService.validarForca('Aa1bbbbb');
    assert.equal(result.ok, true);
  });

  it('senha com 7 chars retorna ok: false', () => {
    const result = PasswordService.validarForca('Aa1bbbb');
    assert.equal(result.ok, false);
    assert.ok(result.msg.length > 0);
  });

  it('senha com 128 chars (limite máximo) é válida', () => {
    const longa  = 'Aa1' + 'b'.repeat(125); // 128 chars
    const result = PasswordService.validarForca(longa);
    assert.equal(result.ok, true);
  });

  it('senha com 129 chars retorna ok: false', () => {
    const muita  = 'Aa1' + 'b'.repeat(126); // 129 chars
    const result = PasswordService.validarForca(muita);
    assert.equal(result.ok, false);
  });

  it('senha sem letra maiúscula retorna ok: false', () => {
    const result = PasswordService.validarForca('senhasem1maiuscula');
    assert.equal(result.ok, false);
  });

  it('senha sem letra minúscula retorna ok: false', () => {
    const result = PasswordService.validarForca('SENHASEM1MINUSCULA');
    assert.equal(result.ok, false);
  });

  it('senha sem dígito retorna ok: false', () => {
    const result = PasswordService.validarForca('SenhaSemDigito');
    assert.equal(result.ok, false);
  });

  it('string vazia retorna ok: false', () => {
    const result = PasswordService.validarForca('');
    assert.equal(result.ok, false);
  });

  it('null retorna ok: false (sem throw)', () => {
    const result = PasswordService.validarForca(null);
    assert.equal(result.ok, false);
  });

  it('undefined retorna ok: false (sem throw)', () => {
    const result = PasswordService.validarForca(undefined);
    assert.equal(result.ok, false);
  });

  it('número como argumento retorna ok: false (sem throw)', () => {
    const result = PasswordService.validarForca(12345678);
    assert.equal(result.ok, false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// hash
// ─────────────────────────────────────────────────────────────────────────────

describe('PasswordService.hash()', () => {

  it('retorna string bcrypt (começa com $2)', async () => {
    const h = await PasswordService.hash('Senh@Valida1');
    assert.ok(h.startsWith('$2'), `hash deve começar com $2, obtido: ${h.slice(0, 4)}`);
    assert.equal(h.length, 60, 'hash bcrypt tem 60 chars');
  });

  it('duas chamadas com a mesma senha produzem hashes diferentes (salt aleatório)', async () => {
    const h1 = await PasswordService.hash('Senh@Valida1');
    const h2 = await PasswordService.hash('Senh@Valida1');
    assert.notEqual(h1, h2);
  });

  it('lança Error para senha vazia', async () => {
    await assert.rejects(
      () => PasswordService.hash(''),
      Error,
    );
  });

  it('lança Error para null', async () => {
    await assert.rejects(
      () => PasswordService.hash(null),
      Error,
    );
  });

  it('lança Error para undefined', async () => {
    await assert.rejects(
      () => PasswordService.hash(undefined),
      Error,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// verificar
// ─────────────────────────────────────────────────────────────────────────────

describe('PasswordService.verificar()', () => {

  it('senha correta contra hash gerado retorna true', async () => {
    const senha = 'MinhaSenh@1';
    const hash  = await PasswordService.hash(senha);
    const ok    = await PasswordService.verificar(senha, hash);
    assert.equal(ok, true);
  });

  it('senha incorreta retorna false', async () => {
    const hash = await PasswordService.hash('SenhaCorreta1');
    const ok   = await PasswordService.verificar('SenhaErrada1', hash);
    assert.equal(ok, false);
  });

  it('senha vazia retorna false (sem throw)', async () => {
    const hash = await PasswordService.hash('SenhaValida1');
    const ok   = await PasswordService.verificar('', hash);
    assert.equal(ok, false);
  });

  it('hash nulo retorna false (sem throw)', async () => {
    const ok = await PasswordService.verificar('SenhaValida1', null);
    assert.equal(ok, false);
  });

  it('ambos null retorna false (sem throw)', async () => {
    const ok = await PasswordService.verificar(null, null);
    assert.equal(ok, false);
  });

  it('hash forjado (string arbitrária) retorna false', async () => {
    const ok = await PasswordService.verificar('SenhaValida1', 'hash-invalido-nao-bcrypt');
    assert.equal(ok, false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Integração: validarForca → hash → verificar (fluxo completo de cadastro)
// ─────────────────────────────────────────────────────────────────────────────

describe('PasswordService — fluxo completo', () => {

  it('validar → hash → verificar retorna true para senha válida', async () => {
    const senha  = 'Fluxo@Completo1';
    const forca  = PasswordService.validarForca(senha);
    assert.equal(forca.ok, true, `validarForca falhou: ${forca.msg}`);

    const hash = await PasswordService.hash(senha);
    const ok   = await PasswordService.verificar(senha, hash);
    assert.equal(ok, true);
  });

  it('senha diferente não verifica contra hash de outra senha', async () => {
    const hash = await PasswordService.hash('SenhaOriginal1');
    const ok   = await PasswordService.verificar('SenhaDiferente1', hash);
    assert.equal(ok, false, 'hash de outra senha não deve verificar');
  });

});
