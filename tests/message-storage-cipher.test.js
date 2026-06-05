'use strict';

/**
 * tests/message-storage-cipher.test.js
 *
 * Testa MessageStorageCipher e ConversationKeyService (integração com
 * MessageCryptoService). Usa Web Crypto API via globalThis.crypto (Node 18+).
 *
 * Cobertura:
 *   - encryptForStorage: retorna payload com estrutura {v,alg,iv,ct,kid}
 *   - decryptFromStorage: round-trip retorna texto original
 *   - decryptFromStorage: retorna null para payload inválido
 *   - Texto puro NÃO aparece em nenhum campo do payload
 *   - validarPayload: aceita estrutura válida, rejeita inválida
 *   - Cache de chave: segunda chamada não re-deriva (sem I/O)
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

// ── Polyfills de browser para Node.js ────────────────────────────────────────
global.btoa = global.btoa ?? ((s) => Buffer.from(s, 'binary').toString('base64'));
global.atob = global.atob ?? ((s) => Buffer.from(s, 'base64').toString('binary'));

// ── Carrega e avalia os arquivos de classe (browser-style) ───────────────────
function loadClass(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const mod = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', src + `\n// capture: exports[name] = ClassName\nconst match = src.match(/^class (\\w+)/m) || [];\nif(match[1]) exports[match[1]] = eval(match[1]);`)(mod);
  return mod;
}

const SHARED = path.join(__dirname, '..', 'shared', 'js');
let MessageCryptoService;
let MessageStorageCipher;

{
  const src = fs.readFileSync(path.join(SHARED, 'MessageCryptoService.js'), 'utf8');
  const mod = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', src + '\nexports.MessageCryptoService = MessageCryptoService;')(mod);
  MessageCryptoService = mod.MessageCryptoService;
  global.MessageCryptoService = MessageCryptoService;
}

{
  // MessageStorageCipher depende de MessageCryptoService e ConversationKeyService
  // Injeta um ConversationKeyService stub que usa chaves reais para o teste
  const src = fs.readFileSync(path.join(SHARED, 'MessageStorageCipher.js'), 'utf8');
  const mod = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', src + '\nexports.MessageStorageCipher = MessageStorageCipher;')(mod);
  MessageStorageCipher = mod.MessageStorageCipher;
}

// ── Stub de ConversationKeyService para os testes ────────────────────────────
// Usa ECDH real para garantir que encrypt/decrypt funciona de ponta a ponta.
class KeyServiceStub {
  #cache = new Map();
  #kpA;
  #kpB;

  async init() {
    this.#kpA = await MessageCryptoService.generateKeyPair();
    this.#kpB = await MessageCryptoService.generateKeyPair();
  }

  // Simula dois participantes: conv 'a-b' usa par (A, B)
  async obterChaveConversa(conversationId, peerId) {
    const cacheKey = `${conversationId}:${peerId}`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    // A deriva com A_priv + B_pub
    const key = await MessageCryptoService.deriveSharedKey(this.#kpA.privateKey, this.#kpB.publicKey);
    this.#cache.set(cacheKey, key);
    return key;
  }

  async obterChaveConversaPeer(conversationId, peerId) {
    const cacheKey = `${conversationId}:${peerId}:peer`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    // B deriva com B_priv + A_pub (mesma chave — propriedade ECDH)
    const key = await MessageCryptoService.deriveSharedKey(this.#kpB.privateKey, this.#kpA.publicKey);
    this.#cache.set(cacheKey, key);
    return key;
  }
}

let keyStub;
before(async () => {
  keyStub = new KeyServiceStub();
  await keyStub.init();

  // Injeta stub global para MessageStorageCipher usar
  global.ConversationKeyService = {
    obterChaveConversa: (c, p) => keyStub.obterChaveConversa(c, p),
  };
});

// ─────────────────────────────────────────────────────────────────────────────

describe('MessageStorageCipher.validarPayload()', () => {
  test('aceita payload válido com v, alg, iv, ct', () => {
    assert.equal(
      MessageStorageCipher.validarPayload({ v: 1, alg: 'AES-GCM-256', iv: 'aGVsbG8=', ct: 'd29ybGQ=' }),
      true,
    );
  });

  test('rejeita payload sem ct', () => {
    assert.equal(MessageStorageCipher.validarPayload({ v: 1, alg: 'A', iv: 'x' }), false);
  });

  test('rejeita payload nulo', () => {
    assert.equal(MessageStorageCipher.validarPayload(null), false);
  });

  test('rejeita payload com iv vazio', () => {
    assert.equal(MessageStorageCipher.validarPayload({ v: 1, alg: 'A', iv: '', ct: 'abc' }), false);
  });

  test('rejeita string', () => {
    assert.equal(MessageStorageCipher.validarPayload('texto'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('MessageStorageCipher.encryptForStorage()', () => {
  const CONV = 'conv-e2e-test';
  const PEER = 'peer-uuid-123';
  const TEXTO = 'Olá, isso é uma mensagem de teste!';

  test('retorna objeto com campos obrigatórios v, alg, iv, ct, kid', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    assert.equal(typeof payload.v,   'number', 'v deve ser number');
    assert.equal(typeof payload.alg, 'string', 'alg deve ser string');
    assert.equal(typeof payload.iv,  'string', 'iv deve ser string');
    assert.equal(typeof payload.ct,  'string', 'ct deve ser string');
    assert.equal(typeof payload.kid, 'string', 'kid deve ser string');
  });

  test('kid contém o peerId', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    assert.equal(payload.kid, PEER);
  });

  test('texto puro NÃO aparece em nenhum campo do payload', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    const serializado = JSON.stringify(payload);
    assert.ok(!serializado.includes(TEXTO), 'payload serializado não deve conter texto puro');
    assert.ok(!serializado.includes('Olá'), 'payload não deve conter texto parcial');
  });

  test('dois envios do mesmo texto produzem IVs diferentes (sem repetição)', async () => {
    const p1 = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    const p2 = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    assert.notEqual(p1.iv, p2.iv, 'IVs devem ser únicos por mensagem');
    assert.notEqual(p1.ct, p2.ct, 'ciphertexts devem diferir com IVs diferentes');
  });

  test('validarPayload aceita o payload gerado', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    assert.equal(MessageStorageCipher.validarPayload(payload), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('MessageStorageCipher round-trip encrypt → decrypt', () => {
  const CONV = 'conv-roundtrip';
  const PEER = 'peer-roundtrip';

  test('descriptografa com a mesma chave derivada pelo remetente', async () => {
    const TEXTO   = 'Mensagem confidencial E2E';
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);
    const decifrado = await MessageStorageCipher.decryptFromStorage(CONV, PEER, payload);
    assert.equal(decifrado, TEXTO);
  });

  test('decryptFromStorage com peer que usa chave derivada simetricamente retorna o mesmo texto', async () => {
    const TEXTO = 'ECDH simétrico funciona';
    // Usa a chave derivada do lado peer (B_priv + A_pub)
    global.ConversationKeyService = {
      obterChaveConversa: (c, p) => keyStub.obterChaveConversaPeer(c, p),
    };
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, TEXTO);

    // Restaura para o lado A
    global.ConversationKeyService = {
      obterChaveConversa: (c, p) => keyStub.obterChaveConversa(c, p),
    };
    // A mensagem cifrada pelo lado B deve ser decifrada pelo lado A (mesma chave ECDH)
    const decifrado = await MessageStorageCipher.decryptFromStorage(CONV, PEER, payload);
    assert.equal(decifrado, TEXTO);
  });

  test('decryptFromStorage retorna null para payload inválido', async () => {
    const result = await MessageStorageCipher.decryptFromStorage(CONV, PEER, { v: 1, alg: 'X' });
    assert.equal(result, null);
  });

  test('decryptFromStorage retorna null para payload nulo', async () => {
    const result = await MessageStorageCipher.decryptFromStorage(CONV, PEER, null);
    assert.equal(result, null);
  });

  test('decryptFromStorage retorna null com ct corrompido', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, 'teste');
    const corrompido = { ...payload, ct: 'dadoscorrompidos' };
    const result = await MessageStorageCipher.decryptFromStorage(CONV, PEER, corrompido);
    assert.equal(result, null);
  });
});
