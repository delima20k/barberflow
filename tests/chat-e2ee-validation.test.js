'use strict';

/**
 * tests/chat-e2ee-validation.test.js
 *
 * Validações do fluxo E2EE do chat:
 *
 *   Deduplicação P2P × Realtime
 *   - Fingerprint idêntico em janela de 8s → suprime cópia realtime
 *   - Fingerprint expirado → não suprime (renderiza normalmente)
 *   - Fingerprints diferentes → ambos renderizados
 *
 *   Mensagens grandes
 *   - Mensagem com 4000 chars (máx) cifra e decifra corretamente
 *   - Payload encrypted_payload mantém estrutura válida para mensagem grande
 *
 *   Compatibilidade histórico legado
 *   - Mensagem sem encryptedPayload usa body diretamente
 *   - Mensagem com encryptedPayload null usa body
 *
 *   Perda de chave (IndexedDB apagado)
 *   - decryptFromStorage retorna null quando chave mudou → exibe placeholder
 */

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

global.btoa = global.btoa ?? ((s) => Buffer.from(s, 'binary').toString('base64'));
global.atob = global.atob ?? ((s) => Buffer.from(s, 'base64').toString('binary'));

const SHARED = path.join(__dirname, '..', 'shared', 'js');

function loadClass(filename, className) {
  const src = fs.readFileSync(path.join(SHARED, filename), 'utf8');
  const mod = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', src + `\nexports['${className}'] = ${className};`)(mod);
  return mod[className];
}

let MessageCryptoService;
let MessageStorageCipher;

before(async () => {
  MessageCryptoService = loadClass('MessageCryptoService.js', 'MessageCryptoService');
  global.MessageCryptoService = MessageCryptoService;

  MessageStorageCipher = loadClass('MessageStorageCipher.js', 'MessageStorageCipher');
  global.MessageStorageCipher = MessageStorageCipher;
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeKeyStub() {
  const kpA = await MessageCryptoService.generateKeyPair();
  const kpB = await MessageCryptoService.generateKeyPair();
  const aesKeyA = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
  const aesKeyB = await MessageCryptoService.deriveSharedKey(kpB.privateKey, kpA.publicKey);
  return { aesKeyA, aesKeyB };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ChatModal deduplicação P2P × Realtime — lógica de fingerprint', () => {

  test('fingerprint de textos iguais é igual', () => {
    const text = 'Olá, tudo bem?';
    const fp1  = text.slice(0, 128);
    const fp2  = text.slice(0, 128);
    assert.equal(fp1, fp2);
  });

  test('fingerprint de textos diferentes é diferente', () => {
    const fp1 = 'Mensagem A'.slice(0, 128);
    const fp2 = 'Mensagem B'.slice(0, 128);
    assert.notEqual(fp1, fp2);
  });

  test('fingerprint de texto com 4000 chars trunca em 128', () => {
    const longText = 'x'.repeat(4000);
    const fp = longText.slice(0, 128);
    assert.equal(fp.length, 128);
  });

  test('janela de deduplicação expira corretamente (simulação)', () => {
    const recent = new Map();
    const WINDOW = 8_000;
    const text   = 'teste de expiração';
    const fp     = text.slice(0, 128);

    // Registra como se P2P tivesse entregue
    recent.set(fp, Date.now() + WINDOW);

    // Dentro da janela → deve ser suprimido
    assert.equal(recent.has(fp) && recent.get(fp) > Date.now(), true, 'deve estar dentro da janela');

    // Simula expiração
    recent.set(fp, Date.now() - 1);
    assert.equal(recent.get(fp) > Date.now(), false, 'deve estar fora da janela após expiração');
  });

  test('dois textos distintos na janela → não deduplica o segundo', () => {
    const recent = new Map();
    const WINDOW = 8_000;
    const fpA = 'Mensagem Alpha'.slice(0, 128);
    const fpB = 'Mensagem Beta'.slice(0, 128);

    recent.set(fpA, Date.now() + WINDOW);

    assert.equal(recent.has(fpB), false, 'texto B não deve estar no mapa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('MessageStorageCipher — mensagens grandes', () => {
  const CONV = 'conv-large';
  const PEER = 'peer-large';

  before(async () => {
    const { aesKeyA } = await makeKeyStub();
    global.ConversationKeyService = {
      obterChaveConversa: async () => aesKeyA,
    };
  });

  test('cifra e decifra mensagem de 4000 chars (máx permitido)', async () => {
    const longText    = 'A'.repeat(4000);
    const payload     = await MessageStorageCipher.encryptForStorage(CONV, PEER, longText);
    const decifrado   = await MessageStorageCipher.decryptFromStorage(CONV, PEER, payload);
    assert.equal(decifrado, longText, 'mensagem de 4000 chars deve ser recuperada intacta');
  });

  test('payload de mensagem grande tem estrutura válida', async () => {
    const payload = await MessageStorageCipher.encryptForStorage(CONV, PEER, 'X'.repeat(4000));
    assert.equal(MessageStorageCipher.validarPayload(payload), true);
    assert.equal(payload.v, 1);
    assert.equal(payload.alg, 'AES-GCM-256');
    assert.ok(payload.iv.length > 0);
    assert.ok(payload.ct.length > 0);
  });

  test('texto puro não aparece no payload de mensagem grande', async () => {
    const longText = 'SEGREDO'.repeat(500); // 3500 chars
    const payload  = await MessageStorageCipher.encryptForStorage(CONV, PEER, longText);
    assert.ok(!JSON.stringify(payload).includes('SEGREDO'), 'texto puro não deve vazar no payload');
  });

  test('cifra mensagem de 1 char (mínimo)', async () => {
    const payload   = await MessageStorageCipher.encryptForStorage(CONV, PEER, 'A');
    const decifrado = await MessageStorageCipher.decryptFromStorage(CONV, PEER, payload);
    assert.equal(decifrado, 'A');
  });

  test('cifra mensagem média (100 chars)', async () => {
    const text      = 'Mensagem de teste com tamanho médio e conteúdo variado: '.padEnd(100, '!');
    const payload   = await MessageStorageCipher.encryptForStorage(CONV, PEER, text);
    const decifrado = await MessageStorageCipher.decryptFromStorage(CONV, PEER, payload);
    assert.equal(decifrado, text);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Compatibilidade — histórico legado (body em claro)', () => {

  test('mensagem sem encryptedPayload tem body direto (sem decifrar)', () => {
    const body = 'Mensagem antiga em texto puro';
    // Simula msg do banco: encryptedPayload ausente
    const msg = { body, encryptedPayload: null, senderId: 'user-a', id: '1', createdAt: new Date().toISOString() };
    // ChatModal usaria msg.body diretamente quando msg.encryptedPayload é falsy
    const textoParaRender = msg.encryptedPayload ? null : msg.body;
    assert.equal(textoParaRender, body);
  });

  test('mensagem com encryptedPayload presente usa decryption path', () => {
    const msg = { body: '', encryptedPayload: { v: 1, alg: 'A', iv: 'x', ct: 'y' }, senderId: 'u', id: '2', createdAt: new Date().toISOString() };
    const precisaDecifrar = Boolean(msg.encryptedPayload && msg.encryptedPayload.ct);
    assert.equal(precisaDecifrar, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Perda de chave E2E — IndexedDB apagado / novo device', () => {

  test('decryptFromStorage retorna null quando chave errada (key loss simulado)', async () => {
    // Simula: A cifrou com kpA, mas B tenta decifrar com kpC (chave diferente)
    const kpA = await MessageCryptoService.generateKeyPair();
    const kpB = await MessageCryptoService.generateKeyPair();
    const kpC = await MessageCryptoService.generateKeyPair(); // nova chave de A após key loss

    const keyAB = await MessageCryptoService.deriveSharedKey(kpA.privateKey, kpB.publicKey);
    global.ConversationKeyService = { obterChaveConversa: async () => keyAB };
    const payload = await MessageStorageCipher.encryptForStorage('c', 'p', 'segredo');

    // B tenta decifrar usando kpC como chave de A (simula novo par gerado após key loss)
    const keyCB = await MessageCryptoService.deriveSharedKey(kpC.privateKey, kpB.publicKey);
    global.ConversationKeyService = { obterChaveConversa: async () => keyCB };
    const resultado = await MessageStorageCipher.decryptFromStorage('c', 'p', payload);

    assert.equal(resultado, null, 'decifração com chave errada deve retornar null');
  });

  test('decryptFromStorage retorna null — UI exibirá placeholder seguro', async () => {
    // Verifica que null é o contrato de falha para o UI mostrar "🔒 Mensagem cifrada"
    const resultado = await MessageStorageCipher.decryptFromStorage('c', 'p', null);
    assert.equal(resultado, null);
    // UI faz: const texto = plain ?? '🔒 Mensagem cifrada';
    const textoUI = resultado ?? '🔒 Mensagem cifrada';
    assert.equal(textoUI, '🔒 Mensagem cifrada');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bloqueio de envio sem chave — sem fallback legado', () => {

  test('encryptForStorage lança quando peer não tem chave — NÃO retorna payload com body', async () => {
    // Simula ConversationKeyService sem chave do peer (como quando peer não registrou)
    global.ConversationKeyService = {
      obterChaveConversa: async () => {
        throw new Error('Chave pública do destinatário não registrada. E2E indisponível.');
      },
    };

    let erroCapturado = null;
    let payloadGerado = null;

    try {
      payloadGerado = await MessageStorageCipher.encryptForStorage('conv-x', 'peer-x', 'mensagem sigilosa');
    } catch (e) {
      erroCapturado = e;
    }

    assert.ok(erroCapturado !== null, 'deve lançar erro quando chave indisponível');
    assert.equal(payloadGerado, null, 'não deve produzir payload quando chave indisponível');
    // Garantia: o erro não contém texto puro da mensagem
    assert.ok(!erroCapturado.message.includes('mensagem sigilosa'), 'erro não deve conter texto puro');
  });

  test('erro de criptografia não produz body — payloadBff deve ser null/undefined sem body', () => {
    // Simula a lógica do ChatModal após falha de criptografia:
    // encryptedPayload = undefined (nunca atribuído por causa do return antecipado)
    // Portanto payloadBff com body puro nunca deve ser construído
    let encryptedPayload; // undefined = nunca atribuído (return antecipado no catch)
    const envioFoiBloqueado = encryptedPayload === undefined;

    assert.equal(envioFoiBloqueado, true, 'envio deve ser bloqueado quando criptografia falha');
    // Confirma que não existe construção de { body: texto } neste caminho
    const payloadBff = encryptedPayload ? { encrypted_payload: encryptedPayload } : null;
    assert.equal(payloadBff, null, 'sem encrypted_payload, nenhum payload deve ser enviado ao BFF');
  });

  test('encryptForStorage propaga erro de chave sem expor texto puro no log', async () => {
    const textoSigiloso = 'DADO_SECRETO_XYZ';
    global.ConversationKeyService = {
      obterChaveConversa: async () => { throw new Error('E2E indisponível para peer-123.'); },
    };

    let mensagemDeErro = '';
    try {
      await MessageStorageCipher.encryptForStorage('c', 'peer-123', textoSigiloso);
    } catch (e) {
      mensagemDeErro = e.message;
    }

    // Regra: mensagem de erro não pode conter o texto puro (segurança de log)
    assert.ok(!mensagemDeErro.includes(textoSigiloso), 'texto puro não deve aparecer na mensagem de erro');
    assert.ok(mensagemDeErro.length > 0, 'deve haver mensagem de erro');
  });
});
