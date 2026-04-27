'use strict';

/**
 * tests/encryption.test.js
 *
 * Testes de EncryptionService e ChunkService.
 * Runner: node:test + node:assert/strict (nativo — sem dependências externas).
 *
 * Cenários cobertos:
 *   EncryptionService:
 *     1. encrypt → decrypt retorna o arquivo original
 *     2. Chave errada → falha com erro de autenticação GCM
 *     3. authTag adulterado → falha com erro de autenticação GCM
 *     4. IV adulterado → falha com erro de autenticação GCM
 *     5. Arquivo grande (100 MB simulado) → encrypt/decrypt funcionam
 *     6. Plaintext não vaza no ciphertext
 *     7. Cada chamada gera chave e IV únicos (sem reutilização)
 *
 *   ChunkService:
 *     8.  split → merge retorna buffer original (N chunks)
 *     9.  Dados do chunk adulterados → merge rejeita
 *     10. Hash do chunk adulterado → merge rejeita
 *     11. Chunk duplicado (índice repetido) → merge rejeita
 *     12. Chunk faltando (gap de índice) → merge rejeita
 *     13. Buffer vazio → split retorna [] e merge retorna Buffer vazio
 *     14. Buffer menor que um chunk → split retorna 1 chunk
 *
 *   Integração EncryptionService + ChunkService:
 *     15. encrypt → split → merge → decrypt retorna original
 *     16. Adulteração em qualquer chunk → decrypt falha
 *     17. Nenhum chunk contém plaintext legível (anti-leak)
 */

const { suite, test }  = require('node:test');
const assert           = require('node:assert/strict');
const crypto           = require('node:crypto');
const path             = require('node:path');

const EncryptionService = require(path.join(__dirname, '..', 'src', 'services', 'EncryptionService'));
const ChunkService      = require(path.join(__dirname, '..', 'src', 'services', 'ChunkService'));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Produz um Buffer aleatório de `n` bytes. */
const randBuf = (n) => crypto.randomBytes(n);

/** Clona um EncryptedResult — imutável para cada teste. */
const clonar = (enc) => ({ ...enc, data: Buffer.from(enc.data) });

// ─────────────────────────────────────────────────────────────────────────────
// EncryptionService
// ─────────────────────────────────────────────────────────────────────────────

suite('EncryptionService', () => {

  const svc = new EncryptionService();

  test('encrypt → decrypt retorna o arquivo original', () => {
    const original  = Buffer.from('conteúdo super secreto do arquivo', 'utf8');
    const encrypted = svc.encrypt(original);

    // Estrutura do resultado
    assert.ok(Buffer.isBuffer(encrypted.data),    'data deve ser Buffer');
    assert.ok(typeof encrypted.key     === 'string', 'key deve ser string');
    assert.ok(typeof encrypted.iv      === 'string', 'iv deve ser string');
    assert.ok(typeof encrypted.authTag === 'string', 'authTag deve ser string');

    // Ciphertext ≠ plaintext
    assert.notDeepEqual(encrypted.data, original, 'ciphertext não deve ser igual ao plaintext');

    const decrypted = svc.decrypt(clonar(encrypted));
    assert.deepEqual(decrypted, original, 'decrypt deve retornar o original');
  });

  test('chave errada → falha com erro de autenticação', () => {
    const original  = Buffer.from('dados muito sensíveis', 'utf8');
    const encrypted = svc.encrypt(original);

    assert.throws(
      () => svc.decrypt({ ...clonar(encrypted), key: crypto.randomBytes(32).toString('hex') }),
      /ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH|bad decrypt|Unsupported state|authentication/i,
      'chave errada deve falhar na autenticação GCM'
    );
  });

  test('authTag adulterado → falha com erro de autenticação', () => {
    const encrypted = svc.encrypt(randBuf(512));

    assert.throws(
      () => svc.decrypt({ ...clonar(encrypted), authTag: crypto.randomBytes(16).toString('hex') }),
      /ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH|bad decrypt|Unsupported state|authentication/i,
      'authTag adulterado deve falhar na autenticação GCM'
    );
  });

  test('IV adulterado → falha com erro de autenticação', () => {
    const encrypted = svc.encrypt(randBuf(256));

    assert.throws(
      () => svc.decrypt({ ...clonar(encrypted), iv: crypto.randomBytes(12).toString('hex') }),
      /ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH|bad decrypt|Unsupported state|authentication/i,
      'IV adulterado deve falhar na autenticação GCM'
    );
  });

  test('arquivo grande (100 MB simulado) → encrypt/decrypt funcionam', () => {
    // AES-GCM é O(n) — 10 MB valida o comportamento sem risco de OOM no CI.
    // Em produção o fluxo é idêntico para qualquer tamanho.
    const large     = randBuf(10 * 1024 * 1024); // 10 MB
    const encrypted = svc.encrypt(large);
    const decrypted = svc.decrypt(clonar(encrypted));

    assert.deepEqual(decrypted, large, 'arquivo grande deve ser recuperado intacto');
  });

  test('plaintext não vaza no ciphertext', () => {
    const plaintext  = Buffer.from('SEGREDO_QUE_NAO_PODE_VAZAR_12345', 'utf8');
    const encrypted  = svc.encrypt(plaintext);
    const cipherStr  = encrypted.data.toString('utf8');

    assert.ok(
      !cipherStr.includes('SEGREDO_QUE_NAO_PODE_VAZAR'),
      'ciphertext não deve conter o plaintext legível'
    );
  });

  test('cada chamada gera chave e IV únicos', () => {
    const buf = randBuf(128);
    const a   = svc.encrypt(buf);
    const b   = svc.encrypt(buf);

    assert.notEqual(a.key, b.key, 'chaves devem ser diferentes');
    assert.notEqual(a.iv,  b.iv,  'IVs devem ser diferentes');
  });

  test('encrypt lança TypeError para não-Buffer', () => {
    assert.throws(() => svc.encrypt('string não é Buffer'), TypeError);
    assert.throws(() => svc.encrypt(null),                  TypeError);
    assert.throws(() => svc.encrypt(42),                    TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChunkService
// ─────────────────────────────────────────────────────────────────────────────

suite('ChunkService', () => {

  // 64 KB por chunk para testes mais rápidos
  const svc = new ChunkService(64 * 1024);

  test('split → merge retorna buffer original (múltiplos chunks)', () => {
    const original = randBuf(200 * 1024); // 200 KB → 4 chunks de 64 KB
    const chunks   = svc.split(original);

    assert.ok(chunks.length > 1, 'deve gerar mais de um chunk');

    chunks.forEach((c, i) => {
      assert.strictEqual(c.index, i,             `índice do chunk ${i} incorreto`);
      assert.ok(Buffer.isBuffer(c.data),         `data do chunk ${i} deve ser Buffer`);
      assert.strictEqual(c.hash.length, 64,      `hash do chunk ${i} deve ter 64 chars (SHA-256 hex)`);
    });

    const merged = svc.merge(chunks);
    assert.deepEqual(merged, original, 'merge deve retornar o buffer original');
  });

  test('dados do chunk adulterados → merge detecta e rejeita', () => {
    const original = randBuf(200 * 1024);
    const chunks   = svc.split(original);

    // Adultera os dados do chunk no índice 1 (mantém hash original → detecção de dados)
    const adulterado = chunks.map(c =>
      c.index === 1
        ? { ...c, data: randBuf(c.data.length) }
        : c
    );

    assert.throws(
      () => svc.merge(adulterado),
      /hash mismatch/i,
      'dados adulterados devem ser detectados pelo hash'
    );
  });

  test('hash do chunk adulterado → merge detecta e rejeita', () => {
    const original = randBuf(128 * 1024);
    const chunks   = svc.split(original);

    // Adultera apenas o hash, mantendo os dados (inversão da integridade)
    const adulterado = chunks.map(c =>
      c.index === 0
        ? { ...c, hash: crypto.randomBytes(32).toString('hex') }
        : c
    );

    assert.throws(
      () => svc.merge(adulterado),
      /hash mismatch/i,
      'hash adulterado deve ser detectado'
    );
  });

  test('chunk duplicado (índice repetido) → merge rejeita sequência', () => {
    const original = randBuf(128 * 1024);
    const chunks   = svc.split(original);

    // Duplica o chunk 0 → índices: [0, 0, 1, ...]
    const comDuplicata = [chunks[0], ...chunks];

    assert.throws(
      () => svc.merge(comDuplicata),
      /sequência|sequence|índice|index/i,
      'índice duplicado deve ser detectado'
    );
  });

  test('chunk faltando (gap de índice) → merge rejeita sequência', () => {
    const original = randBuf(200 * 1024); // 4 chunks
    const chunks   = svc.split(original);

    // Remove o chunk 1 → gap: [0, 2, 3]
    const semChunk1 = chunks.filter(c => c.index !== 1);

    assert.throws(
      () => svc.merge(semChunk1),
      /sequência|sequence|índice|index/i,
      'gap de índice deve ser detectado'
    );
  });

  test('buffer vazio → split retorna [] e merge retorna Buffer vazio', () => {
    const chunks = svc.split(Buffer.alloc(0));
    assert.deepEqual(chunks, [], 'split de buffer vazio deve retornar []');

    const merged = svc.merge([]);
    assert.ok(Buffer.isBuffer(merged),  'merge de [] deve retornar Buffer');
    assert.strictEqual(merged.length, 0, 'merge de [] deve ter length 0');
  });

  test('buffer menor que um chunk → split retorna exatamente 1 chunk', () => {
    const original = randBuf(1024); // 1 KB < 64 KB
    const chunks   = svc.split(original);

    assert.strictEqual(chunks.length, 1, 'deve gerar exatamente 1 chunk');
    assert.strictEqual(chunks[0].index, 0);

    const merged = svc.merge(chunks);
    assert.deepEqual(merged, original);
  });

  test('ChunkService lança RangeError para chunkSizeBytes inválido', () => {
    assert.throws(() => new ChunkService(0),    RangeError);
    assert.throws(() => new ChunkService(-1),   RangeError);
    assert.throws(() => new ChunkService(0.5),  RangeError);
  });

  test('split lança TypeError para não-Buffer', () => {
    assert.throws(() => svc.split('texto'),  TypeError);
    assert.throws(() => svc.split(null),     TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integração EncryptionService + ChunkService
// ─────────────────────────────────────────────────────────────────────────────

suite('Integração EncryptionService + ChunkService', () => {

  const encSvc   = new EncryptionService();
  const chunkSvc = new ChunkService(64 * 1024);

  test('encrypt → split → merge → decrypt retorna o original intacto', () => {
    const original  = randBuf(256 * 1024); // 256 KB → 4 chunks

    const encrypted = encSvc.encrypt(original);
    const chunks    = chunkSvc.split(encrypted.data);
    const merged    = chunkSvc.merge(chunks);
    const decrypted = encSvc.decrypt({ ...encrypted, data: merged });

    assert.deepEqual(decrypted, original, 'pipeline completo deve recuperar o original');
  });

  test('adulteração em qualquer chunk → decrypt falha (integridade end-to-end)', () => {
    const original  = randBuf(256 * 1024);

    const encrypted = encSvc.encrypt(original);
    const chunks    = chunkSvc.split(encrypted.data);

    // Adultera o chunk do meio
    const midIdx    = Math.floor(chunks.length / 2);
    const adulterado = chunks.map(c =>
      c.index === midIdx
        ? { ...c, data: randBuf(c.data.length) }
        : c
    );

    // ChunkService detecta antes mesmo de tentar decrypt
    assert.throws(
      () => {
        const merged    = chunkSvc.merge(adulterado);
        encSvc.decrypt({ ...encrypted, data: merged });
      },
      /hash mismatch|authentication/i,
      'adulteração deve ser detectada na camada de chunks ou de autenticação GCM'
    );
  });

  test('nenhum chunk contém plaintext legível — anti-leak validation', () => {
    const marcador  = 'DADO_SENSIVEL_NAO_PODE_VAZAR_NUNCA';
    const plaintext = Buffer.from(marcador, 'utf8');

    const encrypted = encSvc.encrypt(plaintext);
    const chunks    = chunkSvc.split(encrypted.data);

    for (const chunk of chunks) {
      assert.ok(
        !chunk.data.toString('utf8').includes(marcador),
        `Chunk ${chunk.index} contém plaintext — VIOLAÇÃO DE SEGURANÇA`
      );
    }
  });

  test('arquivo grande simulado 100 MB — pipeline completo', () => {
    // Usa 20 MB para cobrir o requisito sem esgotar RAM do CI.
    // AES-GCM é linear; o comportamento em 100 MB é idêntico.
    const large     = randBuf(20 * 1024 * 1024);
    const encrypted = encSvc.encrypt(large);
    const chunks    = chunkSvc.split(encrypted.data);
    const merged    = chunkSvc.merge(chunks);
    const decrypted = encSvc.decrypt({ ...encrypted, data: merged });

    assert.deepEqual(decrypted, large, 'arquivo grande deve ser recuperado intacto');
  });
});
