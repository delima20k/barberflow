'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.APP_ENV = 'production';
process.env.AUTH_EMAIL_HASH_SECRET = 'test-auth-email-hmac-secret-with-32-bytes-minimum';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

delete require.cache[require.resolve('../middlewares/rateLimiter')];

const SupabaseClient = require('../utils/SupabaseClient');
const RateLimiterMiddleware = require('../middlewares/rateLimiter');

function makeReq(email = 'user@example.com', path = '/forgot-password') {
  return {
    ip: '127.0.0.1',
    path,
    originalUrl: `/api/auth${path}`,
    body: { email },
  };
}

function makeRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('authEmailDbFallback bloqueia quando RPC distribuida atinge limite', async () => {
  SupabaseClient.getInstance = () => ({
    rpc: async (name, payload) => {
      assert.equal(name, 'consume_auth_email_attempt');
      assert.equal(payload.p_purpose, 'forgot-password');
      assert.equal(payload.p_max_attempts, 3);
      assert.match(payload.p_email_hash, /^[a-f0-9]{64}$/);
      assert.equal(
        payload.p_email_hash,
        crypto.createHmac('sha256', process.env.AUTH_EMAIL_HASH_SECRET).update('user@example.com').digest('hex'),
      );
      assert.notEqual(
        payload.p_email_hash,
        crypto.createHash('sha256').update('user@example.com').digest('hex'),
      );
      return {
        data: { allowed: false, attempts: 4, maxAttempts: 3 },
        error: null,
      };
    },
  });

  const req = makeReq();
  const res = makeRes();
  let nextCalled = false;

  await RateLimiterMiddleware.authEmailDbFallback(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.ok, false);
});

test('authEmailDbFallback permite quando RPC distribuida permite', async () => {
  SupabaseClient.getInstance = () => ({
    rpc: async () => ({
      data: { allowed: true, attempts: 2, maxAttempts: 3 },
      error: null,
    }),
  });

  const req = makeReq('user@example.com', '/signup-confirmation');
  const res = makeRes();
  let nextCalled = false;

  await RateLimiterMiddleware.authEmailDbFallback(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
