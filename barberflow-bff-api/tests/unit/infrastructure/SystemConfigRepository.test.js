'use strict';

const { describe, it } = require('node:test');
const assert            = require('node:assert/strict');
const { SystemConfigRepository } = require('../../../infrastructure/config/SystemConfigRepository');

const encryptionFake = { encrypt: () => ({}), decrypt: () => '' };

describe('SystemConfigRepository — construtor', () => {
  it('lança se supabase estiver ausente', () => {
    assert.throws(() => new SystemConfigRepository(null, encryptionFake), TypeError);
  });

  it('lança se encryption estiver ausente', () => {
    const supabaseFake = { from: () => ({}) };
    assert.throws(() => new SystemConfigRepository(supabaseFake, null), TypeError);
  });

  it('lança com mensagem diagnosticável se supabase não tiver .from() (ex: objeto errado passado por engano)', () => {
    assert.throws(
      () => new SystemConfigRepository({}, encryptionFake),
      /esperava um client com \.from\(\)/,
    );
  });

  it('aceita um client com .from() válido', () => {
    const supabaseFake = { from: () => ({}) };
    assert.doesNotThrow(() => new SystemConfigRepository(supabaseFake, encryptionFake));
  });
});
