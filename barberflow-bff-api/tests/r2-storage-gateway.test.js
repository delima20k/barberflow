'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

// R2Client está na raiz do projeto (src/infra), não dentro de barberflow-bff-api
const R2ClientClass = require('../../src/infra/R2Client');

// ── Mock factory ─────────────────────────────────────────────────────────────

function mockR2({ headResult = null } = {}) {
  return {
    presignedPut: async (path, _ct, exp) => `https://r2.test/put/${path}?exp=${exp}`,
    presignedGet: async (path, exp)      => `https://r2.test/get/${path}?exp=${exp}`,
    head:         async ()               => headResult,
    getBuffer:    async ()               => Buffer.from('data'),
    putBuffer:    async ()               => {},
    publicUrl:    (path)                 => `https://pub.r2.test/${path}`,
  };
}

function criarGateway(r2 = mockR2()) {
  const original = R2ClientClass.getInstance;
  R2ClientClass.getInstance = () => r2;
  try {
    const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
    return new R2StorageGateway();
  } finally {
    R2ClientClass.getInstance = original;
  }
}

// ── Testes ───────────────────────────────────────────────────────────────────

suite('R2StorageGateway - createSignedUpload', () => {
  test('retorna uploadUrl, expiresAt e publicUrl com path correto', async () => {
    const r2 = mockR2();
    const original = R2ClientClass.getInstance;
    R2ClientClass.getInstance = () => r2;

    try {
      const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
      const gw = new R2StorageGateway();
      const before = Date.now();
      const res = await gw.createSignedUpload({ path: 'stories/u1/v.mp4', contentType: 'video/mp4', expiresIn: 300 });

      assert.ok(res.uploadUrl.includes('stories/u1/v.mp4'), 'uploadUrl deve conter o path');
      assert.ok(res.publicUrl.includes('stories/u1/v.mp4'), 'publicUrl deve conter o path');
      const exp = new Date(res.expiresAt).getTime();
      assert.ok(exp >= before + 299_000 && exp <= before + 302_000, 'expiresAt deve ser ~300s no futuro');
    } finally {
      R2ClientClass.getInstance = original;
    }
  });
});

suite('R2StorageGateway - assertObjectExists', () => {
  test('retorna sizeBytes e contentType quando objeto existe', async () => {
    const r2 = mockR2({ headResult: { tamanhoBytes: 2048, contentType: 'video/mp4' } });
    const original = R2ClientClass.getInstance;
    R2ClientClass.getInstance = () => r2;

    try {
      const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
      const gw = new R2StorageGateway();
      const res = await gw.assertObjectExists({ path: 'stories/u1/v.mp4' });
      assert.strictEqual(res.sizeBytes, 2048);
      assert.strictEqual(res.contentType, 'video/mp4');
    } finally {
      R2ClientClass.getInstance = original;
    }
  });

  test('lanca AppError 400 quando objeto nao existe no R2', async () => {
    const r2 = mockR2({ headResult: null });
    const original = R2ClientClass.getInstance;
    R2ClientClass.getInstance = () => r2;

    try {
      const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
      const gw = new R2StorageGateway();
      await assert.rejects(
        () => gw.assertObjectExists({ path: 'stories/u1/nao-existe.mp4' }),
        err => err.status === 400,
      );
    } finally {
      R2ClientClass.getInstance = original;
    }
  });
});

suite('R2StorageGateway - createSignedAccess', () => {
  test('retorna signedUrl com path e expiracao', async () => {
    const r2 = mockR2();
    const original = R2ClientClass.getInstance;
    R2ClientClass.getInstance = () => r2;

    try {
      const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
      const gw = new R2StorageGateway();
      const res = await gw.createSignedAccess({ path: 'stories/u1/v.mp4', expiresInSeconds: 60 });
      assert.ok(res.signedUrl.includes('stories/u1/v.mp4'), 'signedUrl deve conter o path');
      assert.ok(res.signedUrl.includes('exp=60'), 'signedUrl deve conter expiresIn');
    } finally {
      R2ClientClass.getInstance = original;
    }
  });
});

suite('R2StorageGateway - sourceBucket', () => {
  test('retorna valor de R2_BUCKET_NAME', () => {
    const original = R2ClientClass.getInstance;
    R2ClientClass.getInstance = () => mockR2();
    process.env.R2_BUCKET_NAME = 'barberflow-media-test';

    try {
      const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
      const gw = new R2StorageGateway();
      assert.strictEqual(gw.sourceBucket, 'barberflow-media-test');
    } finally {
      R2ClientClass.getInstance = original;
      delete process.env.R2_BUCKET_NAME;
    }
  });
});
