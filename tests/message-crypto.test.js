'use strict';
/**
 * tests/message-crypto.test.js
 *
 * Testa MessageCryptoService — criptografia E2E para mensagens P2P.
 * Usa Web Crypto API via globalThis.crypto (Node 18+).
 *
 * Cobertura:
 *   - Geração de par de chaves
 *   - Exportar / importar chave pública (round-trip)
 *   - Derivação de chave compartilhada via ECDH
 *   - Criptografar + descriptografar (round-trip retorna texto original)
 *   - Payload criptografado não contém texto puro
 *   - validateEncryptedPayload: aceita válido, rejeita inválido
 *   - Chaves de sessões diferentes não descriptografam mutuamente
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

// Polyfill para o ambiente de teste Node.js:
// MessageCryptoService usa btoa/atob e window.crypto.subtle
// Node 16+ tem globalThis.crypto; btoa/atob disponíveis desde Node 16.
global.btoa = global.btoa ?? ((s) => Buffer.from(s, 'binary').toString('base64'));
global.atob = global.atob ?? ((s) => Buffer.from(s, 'base64').toString('binary'));

// Carrega a classe diretamente (arquivo usa 'use strict'; não usa module.exports)
// Como é um arquivo de browser class, fazemos eval no contexto do Node.
const fs   = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'shared', 'js', 'MessageCryptoService.js'),
  'utf8',
);
// eslint-disable-next-line no-new-func
new Function(src)();
// Após o eval, MessageCryptoService está no escopo global (atribuído implicitamente)
// Como o arquivo declara `class MessageCryptoService { ... }` no escopo da função,
// precisamos exportá-la explicitamente:
let MessageCryptoService;
{
  // Executa em escopo isolado e captura a classe
  const mod = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', src + '\nexports.MessageCryptoService = MessageCryptoService;')(mod);
  MessageCryptoService = mod.MessageCryptoService;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração de par de chaves
// ─────────────────────────────────────────────────────────────────────────────

suite('MessageCryptoService.generateKeyPair()', () => {

  test('retorna objeto com publicKey e privateKey', async () => {
    const kp = await MessageCryptoService.generateKeyPair();
    assert.ok(kp.publicKey,  'publicKey deve existir');
    assert.ok(kp.privateKey, 'privateKey deve existir');
  });

  test('chave pública tem type "public"', async () => {
    const { publicKey } = await MessageCryptoService.generateKeyPair();
    assert.strictEqual(publicKey.type, 'public');
  });

  test('chave privada tem type "private"', async () => {
    const { privateKey } = await MessageCryptoService.generateKeyPair();
    assert.strictEqual(privateKey.type, 'private');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exportar / importar chave pública
// ─────────────────────────────────────────────────────────────────────────────

suite('MessageCryptoService exportPublicKey/importPublicKey', () => {

  test('exportPublicKey retorna string base64 não vazia', async () => {
    const { publicKey } = await MessageCryptoService.generateKeyPair();
    const b64 = await MessageCryptoService.exportPublicKey(publicKey);
    assert.strictEqual(typeof b64, 'string');
    assert.ok(b64.length > 0);
  });

  test('round-trip: importar chave exportada produz CryptoKey válida', async () => {
    const { publicKey } = await MessageCryptoService.generateKeyPair();
    const b64 = await MessageCryptoService.exportPublicKey(publicKey);
    const importada = await MessageCryptoService.importPublicKey(b64);
    assert.strictEqual(importada.type, 'public');
  });

  test('importar string inválida lança erro', async () => {
    await assert.rejects(
      () => MessageCryptoService.importPublicKey('nao-e-base64-valido!!!'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Derivação de chave compartilhada (ECDH)
// ─────────────────────────────────────────────────────────────────────────────

suite('MessageCryptoService.deriveSharedKey()', () => {

  test('A→B e B→A derivam a mesma chave (verificado por encrypt/decrypt cruzado)', async () => {
    const kpA = await MessageCryptoService.generateKeyPair();
    const kpB = await MessageCryptoService.generateKeyPair();

    const sharedA = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
    const sharedB = await MessageCryptoService.deriveSharedKey(kpB.privateKey, kpA.publicKey);

    const texto    = 'Olá, mensagem de teste!';
    const payload  = await MessageCryptoService.encryptMessage(texto, sharedA);
    const decifrado = await MessageCryptoService.decryptMessage(payload, sharedB);

    assert.strictEqual(decifrado, texto);
  });

  test('chave derivada tem algoritmo AES-GCM', async () => {
    const kpA = await MessageCryptoService.generateKeyPair();
    const kpB = await MessageCryptoService.generateKeyPair();
    const key = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
    assert.strictEqual(key.algorithm.name, 'AES-GCM');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criptografar / descriptografar
// ─────────────────────────────────────────────────────────────────────────────

suite('MessageCryptoService encryptMessage/decryptMessage', () => {

  async function criarChaveCompartilhada() {
    const kpA = await MessageCryptoService.generateKeyPair();
    const kpB = await MessageCryptoService.generateKeyPair();
    return MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
  }

  test('round-trip retorna texto original', async () => {
    const key     = await criarChaveCompartilhada();
    const texto   = 'Quero cortar o cabelo amanhã às 14h!';
    const payload = await MessageCryptoService.encryptMessage(texto, key);
    const saida   = await MessageCryptoService.decryptMessage(payload, key);
    assert.strictEqual(saida, texto);
  });

  test('payload criptografado NÃO contém o texto puro', async () => {
    const key    = await criarChaveCompartilhada();
    const texto  = 'mensagem-secreta-12345';
    const payload = await MessageCryptoService.encryptMessage(texto, key);
    const json    = JSON.stringify(payload);
    assert.ok(!json.includes(texto), 'texto puro não deve aparecer no payload');
  });

  test('payload tem campos iv e ct com strings não vazias', async () => {
    const key     = await criarChaveCompartilhada();
    const payload = await MessageCryptoService.encryptMessage('teste', key);
    assert.strictEqual(typeof payload.iv, 'string');
    assert.ok(payload.iv.length > 0);
    assert.strictEqual(typeof payload.ct, 'string');
    assert.ok(payload.ct.length > 0);
  });

  test('dois payloads do mesmo texto têm IVs diferentes (IV único por mensagem)', async () => {
    const key = await criarChaveCompartilhada();
    const p1  = await MessageCryptoService.encryptMessage('oi', key);
    const p2  = await MessageCryptoService.encryptMessage('oi', key);
    assert.notStrictEqual(p1.iv, p2.iv);
  });

  test('chaves de sessões diferentes NÃO descriptografam mutuamente', async () => {
    const kpA = await MessageCryptoService.generateKeyPair();
    const kpB = await MessageCryptoService.generateKeyPair();
    const kpC = await MessageCryptoService.generateKeyPair();

    const sharedAB = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
    const sharedAC = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpC.publicKey);

    const payload = await MessageCryptoService.encryptMessage('segredo', sharedAB);

    await assert.rejects(
      () => MessageCryptoService.decryptMessage(payload, sharedAC),
      'descriptografia com chave errada deve lançar erro',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateEncryptedPayload
// ─────────────────────────────────────────────────────────────────────────────

suite('MessageCryptoService.validateEncryptedPayload()', () => {

  test('retorna true para payload válido { iv, ct }', () => {
    assert.strictEqual(
      MessageCryptoService.validateEncryptedPayload({ iv: 'abc', ct: 'xyz' }),
      true,
    );
  });

  test('retorna false para payload null', () => {
    assert.strictEqual(MessageCryptoService.validateEncryptedPayload(null), false);
  });

  test('retorna false para payload sem iv', () => {
    assert.strictEqual(MessageCryptoService.validateEncryptedPayload({ ct: 'xyz' }), false);
  });

  test('retorna false para payload sem ct', () => {
    assert.strictEqual(MessageCryptoService.validateEncryptedPayload({ iv: 'abc' }), false);
  });

  test('retorna false para iv vazio', () => {
    assert.strictEqual(MessageCryptoService.validateEncryptedPayload({ iv: '', ct: 'xyz' }), false);
  });

  test('retorna false para string em vez de objeto', () => {
    assert.strictEqual(MessageCryptoService.validateEncryptedPayload('mensagem'), false);
  });
});
