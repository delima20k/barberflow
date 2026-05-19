'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Testes: TokenService
// Framework: node:test + node:assert/strict
// Cobre: gerarAccessToken, gerarRefreshToken, verificar, verificarSupabase,
//        gerarAdmin, verificarAdmin
// ─────────────────────────────────────────────────────────────────────────────

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const jwt              = require('jsonwebtoken');
const path             = require('node:path');

// Segredos configurados antes de carregar o módulo (lidos em tempo de chamada)
process.env.JWT_ACCESS_SECRET   = 'test-access-secret-minimo-32-caracteres!!';
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret-minimo-32-caracteres!!';
process.env.SUPABASE_JWT_SECRET = 'test-supabase-secret-minimo-32-caracteres!';
process.env.ADMIN_JWT_SECRET    = 'test-admin-secret-minimo-32-caracteres!!!!';

const TokenService = require(path.join(__dirname, '..', 'src', 'infra', 'TokenService'));

// ─────────────────────────────────────────────────────────────────────────────
// gerarAccessToken
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenService.gerarAccessToken()', () => {

  it('retorna string JWT válida para payload completo', () => {
    const token = TokenService.gerarAccessToken({ sub: 'uuid-123', email: 'a@b.com', role: 'client' });
    assert.equal(typeof token, 'string');
    assert.ok(token.split('.').length === 3, 'deve ter 3 partes (header.payload.signature)');
  });

  it('payload decodificado contém sub, email, role e type=access', () => {
    const token   = TokenService.gerarAccessToken({ sub: 'uuid-abc', email: 'x@y.com', role: 'barber' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.sub,   'uuid-abc');
    assert.equal(decoded.email, 'x@y.com');
    assert.equal(decoded.role,  'barber');
    assert.equal(decoded.type,  'access');
  });

  it('role padrão é "client" quando não informado', () => {
    const token   = TokenService.gerarAccessToken({ sub: 'uuid-def' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.role, 'client');
  });

  it('email padrão é string vazia quando não informado', () => {
    const token   = TokenService.gerarAccessToken({ sub: 'uuid-ghi' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.email, '');
  });

  it('lança Error com status 400 quando sub está ausente', () => {
    assert.throws(
      () => TokenService.gerarAccessToken({ email: 'sem@sub.com' }),
      (err) => err.status === 400,
    );
  });

  it('lança Error com status 400 para payload null', () => {
    assert.throws(
      () => TokenService.gerarAccessToken(null),
      (err) => err.status === 400,
    );
  });

  it('lança Error com status 500 quando JWT_ACCESS_SECRET ausente', () => {
    const original = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    assert.throws(
      () => TokenService.gerarAccessToken({ sub: 'uuid-test' }),
      (err) => err.status === 500,
    );
    process.env.JWT_ACCESS_SECRET = original;
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// gerarRefreshToken
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenService.gerarRefreshToken()', () => {

  it('retorna string JWT válida para userId informado', () => {
    const token = TokenService.gerarRefreshToken('uuid-user-1');
    assert.equal(typeof token, 'string');
    assert.ok(token.split('.').length === 3);
  });

  it('payload contém sub e type=refresh', () => {
    const token   = TokenService.gerarRefreshToken('uuid-user-2');
    const decoded = jwt.decode(token);
    assert.equal(decoded.sub,  'uuid-user-2');
    assert.equal(decoded.type, 'refresh');
  });

  it('não inclui email nem role no payload (dados mínimos)', () => {
    const token   = TokenService.gerarRefreshToken('uuid-user-3');
    const decoded = jwt.decode(token);
    assert.equal(decoded.email, undefined);
    assert.equal(decoded.role,  undefined);
  });

  it('lança Error com status 400 para userId vazio', () => {
    assert.throws(
      () => TokenService.gerarRefreshToken(''),
      (err) => err.status === 400,
    );
  });

  it('lança Error com status 400 para userId null', () => {
    assert.throws(
      () => TokenService.gerarRefreshToken(null),
      (err) => err.status === 400,
    );
  });

  it('lança Error com status 500 quando JWT_REFRESH_SECRET ausente', () => {
    const original = process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    assert.throws(
      () => TokenService.gerarRefreshToken('uuid-user-4'),
      (err) => err.status === 500,
    );
    process.env.JWT_REFRESH_SECRET = original;
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// verificar
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenService.verificar()', () => {

  it('verifica access token válido e retorna payload correto', () => {
    const token   = TokenService.gerarAccessToken({ sub: 'uuid-v1', role: 'client' });
    const payload = TokenService.verificar(token, 'access');
    assert.equal(payload.sub,  'uuid-v1');
    assert.equal(payload.type, 'access');
  });

  it('verifica refresh token válido e retorna payload correto', () => {
    const token   = TokenService.gerarRefreshToken('uuid-v2');
    const payload = TokenService.verificar(token, 'refresh');
    assert.equal(payload.sub,  'uuid-v2');
    assert.equal(payload.type, 'refresh');
  });

  it('tipo padrão é "access" quando não informado', () => {
    const token   = TokenService.gerarAccessToken({ sub: 'uuid-v3' });
    const payload = TokenService.verificar(token);
    assert.equal(payload.type, 'access');
  });

  it('lança Error 401 ao usar refresh token onde se espera access', () => {
    const token = TokenService.gerarRefreshToken('uuid-v4');
    assert.throws(
      () => TokenService.verificar(token, 'access'),
      (err) => err.status === 401,
    );
  });

  it('lança Error 401 ao usar access token onde se espera refresh', () => {
    const token = TokenService.gerarAccessToken({ sub: 'uuid-v5' });
    assert.throws(
      () => TokenService.verificar(token, 'refresh'),
      (err) => err.status === 401,
    );
  });

  it('lança Error 401 para token com assinatura adulterada', () => {
    const token      = TokenService.gerarAccessToken({ sub: 'uuid-v6' });
    const adulterado = token.slice(0, -10) + 'XXXXXXXXXX';
    assert.throws(
      () => TokenService.verificar(adulterado, 'access'),
      (err) => err.status === 401,
    );
  });

  it('lança Error 401 para token completamente inválido', () => {
    assert.throws(
      () => TokenService.verificar('nao.e.um.jwt.valido', 'access'),
      (err) => err.status === 401,
    );
  });

  it('lança Error 401 para token expirado', () => {
    // exp: 1 = Unix timestamp Jan 1970 — garantidamente expirado
    const token = jwt.sign(
      { sub: 'uuid-v7', type: 'access', iss: 'barberflow', exp: 1 },
      process.env.JWT_ACCESS_SECRET,
      { algorithm: 'HS256' },
    );
    assert.throws(
      () => TokenService.verificar(token, 'access'),
      (err) => err.status === 401,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// verificarSupabase
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenService.verificarSupabase()', () => {

  it('lança Error 500 quando SUPABASE_JWT_SECRET ausente', () => {
    const original = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    assert.throws(
      () => TokenService.verificarSupabase('qualquer.token.aqui'),
      (err) => err.status === 500,
    );
    process.env.SUPABASE_JWT_SECRET = original;
  });

  it('verifica token Supabase simulado (HS256 com SUPABASE_JWT_SECRET)', () => {
    const token = jwt.sign(
      { sub: 'user-supa-1', email: 'supa@test.com', role: 'authenticated' },
      process.env.SUPABASE_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const payload = TokenService.verificarSupabase(token);
    assert.equal(payload.sub,   'user-supa-1');
    assert.equal(payload.email, 'supa@test.com');
  });

  it('lança Error 401 para token Supabase com assinatura inválida', () => {
    const token = jwt.sign(
      { sub: 'user-supa-2' },
      'secret-errado-diferente-do-configurado',
      { algorithm: 'HS256' },
    );
    assert.throws(
      () => TokenService.verificarSupabase(token),
      (err) => err.status === 401,
    );
  });

  it('lança Error 401 para string arbitrária', () => {
    assert.throws(
      () => TokenService.verificarSupabase('nao-e-um-jwt'),
      (err) => err.status === 401,
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// gerarAdmin / verificarAdmin
// ─────────────────────────────────────────────────────────────────────────────

describe('TokenService.gerarAdmin() + verificarAdmin()', () => {

  it('gera token admin com email e type=admin no payload', () => {
    const token   = TokenService.gerarAdmin({ email: 'admin@barber.com' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.email, 'admin@barber.com');
    assert.equal(decoded.type,  'admin');
  });

  it('verifica token admin válido e retorna payload', () => {
    const token   = TokenService.gerarAdmin({ email: 'admin2@barber.com' });
    const payload = TokenService.verificarAdmin(token);
    assert.equal(payload.email, 'admin2@barber.com');
    assert.equal(payload.type,  'admin');
  });

  it('lança Error 400 quando email ausente em gerarAdmin', () => {
    assert.throws(
      () => TokenService.gerarAdmin({}),
      (err) => err.status === 400,
    );
  });

  it('lança Error 400 para payload null em gerarAdmin', () => {
    assert.throws(
      () => TokenService.gerarAdmin(null),
      (err) => err.status === 400,
    );
  });

  it('verificarAdmin rejeita token de access (type errado)', () => {
    const token = TokenService.gerarAccessToken({ sub: 'uuid-not-admin' });
    assert.throws(
      () => TokenService.verificarAdmin(token),
      (err) => err.status === 401,
    );
  });

  it('verificarAdmin rejeita token com assinatura adulterada', () => {
    const token      = TokenService.gerarAdmin({ email: 'admin3@barber.com' });
    const adulterado = token.slice(0, -8) + 'ZZZZZZZZ';
    assert.throws(
      () => TokenService.verificarAdmin(adulterado),
      (err) => err.status === 401,
    );
  });

  it('lança Error 500 quando ADMIN_JWT_SECRET ausente em gerarAdmin', () => {
    const original = process.env.ADMIN_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    assert.throws(
      () => TokenService.gerarAdmin({ email: 'admin@barber.com' }),
      (err) => err.status === 500,
    );
    process.env.ADMIN_JWT_SECRET = original;
  });

});
