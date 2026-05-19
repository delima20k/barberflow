'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Testes: HashService
// Framework: node:test + node:assert/strict
// ─────────────────────────────────────────────────────────────────────────────

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const HashService = require('../src/services/HashService');
const ChunkService = require('../src/services/ChunkService');

// ─────────────────────────────────────────────────────────────────────────────
// Suite: HashService — generateHash
// ─────────────────────────────────────────────────────────────────────────────
describe('HashService.generateHash()', () => {

  it('retorna string hex de 64 chars para buffer não-vazio', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('barberflow-hash-test');
    const hash = svc.generateHash(buf);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hash), 'deve ser hex lowercase');
  });

  it('buffer vazio → hash determinístico de 64 chars (SHA-256 do vazio)', () => {
    const svc   = new HashService();
    const hash  = svc.generateHash(Buffer.alloc(0));
    const known = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    assert.equal(hash, known);
  });

  it('mesmo buffer → mesmo hash (determinismo)', () => {
    const svc = new HashService();
    const buf = Buffer.from('dados-determinísticos');
    assert.equal(svc.generateHash(buf), svc.generateHash(buf));
  });

  it('buffers diferentes → hashes diferentes', () => {
    const svc = new HashService();
    const h1 = svc.generateHash(Buffer.from('a'));
    const h2 = svc.generateHash(Buffer.from('b'));
    assert.notEqual(h1, h2);
  });

  it('um byte alterado → hash completamente diferente', () => {
    const svc = new HashService();
    const buf1 = Buffer.from([0x01, 0x02, 0x03]);
    const buf2 = Buffer.from([0x01, 0x02, 0xFF]); // último byte diferente
    assert.notEqual(svc.generateHash(buf1), svc.generateHash(buf2));
  });

  it('lança TypeError para string (não Buffer)', () => {
    const svc = new HashService();
    assert.throws(
      () => svc.generateHash('não-é-buffer'),
      TypeError,
    );
  });

  it('lança TypeError para null', () => {
    const svc = new HashService();
    assert.throws(
      () => svc.generateHash(null),
      TypeError,
    );
  });

  it('lança TypeError para Uint8Array não-Buffer', () => {
    const svc = new HashService();
    const u8  = new Uint8Array([1, 2, 3]);
    assert.throws(
      () => svc.generateHash(u8),
      TypeError,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: HashService — validateHash
// ─────────────────────────────────────────────────────────────────────────────
describe('HashService.validateHash()', () => {

  it('buffer correto + hash correto → não lança', () => {
    const svc = new HashService();
    const buf = Buffer.from('conteúdo-válido');
    const hash = svc.generateHash(buf);
    assert.doesNotThrow(() => svc.validateHash(buf, hash));
  });

  it('buffer adulterado → lança Error', () => {
    const svc     = new HashService();
    const buf     = Buffer.from('dado-original');
    const hash    = svc.generateHash(buf);
    const adulter = Buffer.from('dado-adulterado');
    assert.throws(
      () => svc.validateHash(adulter, hash),
      Error,
    );
  });

  it('hash errado (string diferente) → lança Error', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('payload');
    const hash = svc.generateHash(buf);
    const errado = hash.replace(/[a-f]/, 'z'); // garante string diferente
    assert.throws(
      () => svc.validateHash(buf, errado.padEnd(64, '0').slice(0, 64)),
      Error,
    );
  });

  it('hash totalmente errado (64 zeros) → lança Error', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('qualquer-dado');
    assert.throws(
      () => svc.validateHash(buf, '0'.repeat(64)),
      Error,
    );
  });

  it('lança TypeError para buffer não-Buffer', () => {
    const svc = new HashService();
    assert.throws(
      () => svc.validateHash('não-buffer', '0'.repeat(64)),
      TypeError,
    );
  });

  it('lança TypeError para expected não-string', () => {
    const svc = new HashService();
    const buf = Buffer.from('test');
    assert.throws(
      () => svc.validateHash(buf, null),
      TypeError,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: HashService — check (sem throw)
// ─────────────────────────────────────────────────────────────────────────────
describe('HashService.check()', () => {

  it('buffer + hash correto → true', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('check-valid');
    const hash = svc.generateHash(buf);
    assert.equal(svc.check(buf, hash), true);
  });

  it('buffer adulterado → false', () => {
    const svc   = new HashService();
    const buf   = Buffer.from('original');
    const hash  = svc.generateHash(buf);
    assert.equal(svc.check(Buffer.from('adulterado'), hash), false);
  });

  it('hash errado → false', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('data');
    assert.equal(svc.check(buf, 'f'.repeat(64)), false);
  });

  it('não-Buffer → false (sem throw)', () => {
    const svc = new HashService();
    assert.equal(svc.check('string', 'hash'), false);
    assert.equal(svc.check(null, 'hash'), false);
    assert.equal(svc.check(Buffer.alloc(0), 42), false);
  });

  it('hash case-insensitive → true (aceita uppercase)', () => {
    const svc  = new HashService();
    const buf  = Buffer.from('case-test');
    const hash = svc.generateHash(buf).toUpperCase();
    assert.equal(svc.check(buf, hash), true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: Integração HashService ↔ ChunkService
// ─────────────────────────────────────────────────────────────────────────────
describe('HashService integração com ChunkService', () => {

  it('split + merge intacto → reconstrói buffer original', () => {
    const svc    = new ChunkService(512); // chunk pequeno para testar multi-chunk
    const data   = crypto.randomBytes(1500);
    const chunks = svc.split(data);
    assert.ok(chunks.length > 1, 'deve ter criado múltiplos chunks');
    const merged = svc.merge(chunks);
    assert.deepEqual(merged, data);
  });

  it('chunk adulterado (dado) → merge lança "hash mismatch"', () => {
    const svc    = new ChunkService(512);
    const data   = crypto.randomBytes(1500);
    const chunks = svc.split(data);

    // Adultera os dados do primeiro chunk
    const adulterado = Buffer.from(chunks[0].data);
    adulterado[0] ^= 0xFF;
    const chunksAdulterados = [
      { ...chunks[0], data: adulterado },
      ...chunks.slice(1),
    ];

    assert.throws(
      () => svc.merge(chunksAdulterados),
      /hash mismatch/,
    );
  });

  it('chunk com hash adulterado → merge lança "hash mismatch"', () => {
    const svc    = new ChunkService(512);
    const data   = crypto.randomBytes(512);
    const chunks = svc.split(data);

    const chunksAdulterados = [
      { ...chunks[0], hash: '0'.repeat(64) },
    ];

    assert.throws(
      () => svc.merge(chunksAdulterados),
      /hash mismatch/,
    );
  });

  it('HashService injetado no ChunkService → comportamento idêntico', () => {
    const hashSvc  = new HashService();
    const svc      = new ChunkService(256, hashSvc);
    const data     = crypto.randomBytes(800);
    const chunks   = svc.split(data);
    const merged   = svc.merge(chunks);
    assert.deepEqual(merged, data);
  });

  it('generateHash do HashService bate com hash armazenado nos chunks', () => {
    const hashSvc = new HashService();
    const svc     = new ChunkService(256, hashSvc);
    const data    = crypto.randomBytes(500);
    const chunks  = svc.split(data);

    for (const chunk of chunks) {
      const expected = hashSvc.generateHash(chunk.data);
      assert.equal(chunk.hash, expected);
    }
  });

});
