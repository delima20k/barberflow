'use strict';

const jwt = require('jsonwebtoken');

// ── Constantes de teste ──────────────────────────────────────────
const UUID_TEST   = '550e8400-e29b-41d4-a716-446655440000';
const SUPA_SECRET = 'test-supabase-jwt-secret-for-testing-only-32chars';

/**
 * Cria mocks de req/res/next para testes de middleware.
 * @param {object} [opts]
 * @param {object} [opts.headers]  — headers HTTP simulados
 * @param {string} [opts.method]   — método HTTP (default: 'GET')
 * @param {string} [opts.path]     — path da rota (default: '/')
 * @returns {{ req, res, next, captured }}
 */
function criarMocks({ headers = {}, method = 'GET', path = '/' } = {}) {
  const captured = { status: null, body: null, headers: {} };

  const res = {
    status:      (s) => { captured.status = s; return res; },
    json:        (b) => { captured.body   = b; return res; },
    end:         ()  => res,
    setHeader:   (k, v) => { captured.headers[k] = v; },
    headersSent: false,
    on:          () => {},
  };

  const req = {
    headers: { ...headers },
    user:    null,
    method,
    path,
    url:     path,
    ip:      '127.0.0.1',
    socket:  { remoteAddress: '127.0.0.1' },
  };

  const calls = [];
  const next  = Object.assign(() => calls.push(1), { calls });

  return { req, res, next, captured };
}

/**
 * Gera JWT compatível com o formato do Supabase Auth (HS256).
 * @param {{ sub?: string, email?: string, exp?: number }} [payload]
 * @returns {string}
 */
function gerarTokenSupa(payload = {}) {
  const claims = {
    sub:   payload.sub   ?? UUID_TEST,
    email: payload.email ?? 'test@barberflow.com',
    role:  'authenticated',
    iat:   Math.floor(Date.now() / 1000),
  };

  if (payload.exp !== undefined) {
    claims.exp = payload.exp;
  }

  return jwt.sign(claims, SUPA_SECRET, { algorithm: 'HS256' });
}

module.exports = { criarMocks, gerarTokenSupa, UUID_TEST, SUPA_SECRET };
