'use strict';

// =============================================================
// auth-services.test.js — TDD para PasswordService, TokenService
// e AuthService (camada de autenticação segura).
//
// Variáveis de ambiente definidas ANTES de qualquer require.
// =============================================================

process.env.BCRYPT_ROUNDS      = '4';   // acelera bcrypt em testes
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-32chars-ok!!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-ok!!';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const PasswordService = require('../src/infra/PasswordService');
const TokenService    = require('../src/infra/TokenService');
const AuthService     = require('../src/services/AuthService');

// ─── helpers ─────────────────────────────────────────────────────────────────

const UUID_USER = '00000000-0000-4000-8000-000000000001';

const SESSAO_MOCK = {
  access_token:  'at-mock-access-token',
  refresh_token: 'rt-mock-refresh-token',
  expires_at:    9999999999,
};

const USER_MOCK = { id: UUID_USER, email: 'barbeiro@barberflow.com' };

/**
 * Fábrica de mock do cliente Supabase para AuthService.
 * Todos os campos são configuráveis para cobrir cenários de erro.
 */
function criarSupabaseMock({
  loginOk      = true,
  refreshOk    = true,
  signOutError = null,
  updatePwdOk  = true,
  resetPwdOk   = true,
} = {}) {
  return {
    auth: {
      signInWithPassword: fn().mockResolvedValue(
        loginOk
          ? { data: { user: USER_MOCK, session: SESSAO_MOCK }, error: null }
          : { data: null, error: { message: 'Invalid login credentials' } }
      ),
      refreshSession: fn().mockResolvedValue(
        refreshOk
          ? { data: { session: SESSAO_MOCK }, error: null }
          : { data: null, error: { message: 'refresh_token_not_found' } }
      ),
      resetPasswordForEmail: fn().mockResolvedValue(
        resetPwdOk
          ? { data: null, error: null }
          : { data: null, error: { message: 'User not found' } }
      ),
      admin: {
        signOut:         fn().mockResolvedValue({ error: signOutError }),
        updateUserById:  fn().mockResolvedValue(
          updatePwdOk
            ? { data: { user: USER_MOCK }, error: null }
            : { data: null, error: new Error('update failed') }
        ),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — PasswordService
// ─────────────────────────────────────────────────────────────────────────────

suite('PasswordService.validarForca()', () => {

  test('aceita senha forte (maiúscula + minúscula + dígito + >=8 chars)', () => {
    const r = PasswordService.validarForca('Barber1Flow');
    assert.strictEqual(r.ok, true);
  });

  test('rejeita senha com menos de 8 caracteres', () => {
    const r = PasswordService.validarForca('Ab1!');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /8/);
  });

  test('rejeita senha sem letra maiúscula', () => {
    const r = PasswordService.validarForca('barber1flow');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /maiúscula|maiusc/i);
  });

  test('rejeita senha sem número', () => {
    const r = PasswordService.validarForca('BarberFlow');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /número|numero/i);
  });

  test('rejeita senha vazia ou nula', () => {
    assert.strictEqual(PasswordService.validarForca('').ok,   false);
    assert.strictEqual(PasswordService.validarForca(null).ok, false);
  });

  test('rejeita senha com mais de 128 caracteres', () => {
    const r = PasswordService.validarForca('A1' + 'a'.repeat(200));
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /longa/i);
  });
});

suite('PasswordService.hash() e verificar()', () => {

  test('hash() retorna string diferente da senha original', async () => {
    const h = await PasswordService.hash('Barber1Flow');
    assert.ok(typeof h === 'string');
    assert.notStrictEqual(h, 'Barber1Flow');
  });

  test('dois hashes da mesma senha são diferentes (salt aleatório)', async () => {
    const h1 = await PasswordService.hash('Barber1Flow');
    const h2 = await PasswordService.hash('Barber1Flow');
    assert.notStrictEqual(h1, h2);
  });

  test('verificar() retorna true para senha correta', async () => {
    const h = await PasswordService.hash('Barber1Flow');
    assert.strictEqual(await PasswordService.verificar('Barber1Flow', h), true);
  });

  test('verificar() retorna false para senha errada', async () => {
    const h = await PasswordService.hash('Barber1Flow');
    assert.strictEqual(await PasswordService.verificar('SenhaErrada1', h), false);
  });

  test('verificar() retorna false para hash vazio', async () => {
    assert.strictEqual(await PasswordService.verificar('Barber1Flow', ''), false);
    assert.strictEqual(await PasswordService.verificar('Barber1Flow', null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — TokenService
// ─────────────────────────────────────────────────────────────────────────────

suite('TokenService.gerarAccessToken() e verificar()', () => {

  test('lança erro se payload.sub ausente', () => {
    assert.throws(() => TokenService.gerarAccessToken({}),         { status: 400 });
    assert.throws(() => TokenService.gerarAccessToken(null),       { status: 400 });
    assert.throws(() => TokenService.gerarAccessToken({ sub: '' }), { status: 400 });
  });

  test('retorna string JWT válida', () => {
    const token = TokenService.gerarAccessToken({ sub: UUID_USER, role: 'client' });
    assert.ok(typeof token === 'string');
    assert.ok(token.split('.').length === 3);  // header.payload.sig
  });

  test('verificar() decodifica payload correto do access token', () => {
    const token   = TokenService.gerarAccessToken({ sub: UUID_USER, email: 'a@b.com', role: 'owner' });
    const payload = TokenService.verificar(token, 'access');
    assert.strictEqual(payload.sub,  UUID_USER);
    assert.strictEqual(payload.role, 'owner');
    assert.strictEqual(payload.type, 'access');
  });

  test('verificar() lança {status:401} para token string inválida', () => {
    assert.throws(() => TokenService.verificar('token.invalido.aqui', 'access'), { status: 401 });
  });

  test('verificar(access) rejeita token do tipo refresh', () => {
    const rt = TokenService.gerarRefreshToken(UUID_USER);
    assert.throws(() => TokenService.verificar(rt, 'access'), { status: 401 });
  });
});

suite('TokenService.gerarRefreshToken() e verificarSupabase()', () => {

  test('gerarRefreshToken + verificar(refresh) funciona corretamente', () => {
    const token   = TokenService.gerarRefreshToken(UUID_USER);
    const payload = TokenService.verificar(token, 'refresh');
    assert.strictEqual(payload.sub,  UUID_USER);
    assert.strictEqual(payload.type, 'refresh');
  });

  test('refresh token é string diferente do access token do mesmo user', () => {
    const at = TokenService.gerarAccessToken({ sub: UUID_USER });
    const rt = TokenService.gerarRefreshToken(UUID_USER);
    assert.notStrictEqual(at, rt);
  });

  test('verificarSupabase() lança {status:500} se SUPABASE_JWT_SECRET não configurado', () => {
    const original = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      assert.throws(() => TokenService.verificarSupabase('qualquer'), { status: 500 });
    } finally {
      if (original !== undefined) process.env.SUPABASE_JWT_SECRET = original;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — AuthService
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthService.login()', () => {

  test('lança {status:400} para e-mail com formato inválido', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.login('nao-e-email', 'Senha1!ok'), (err) => {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /email/i);
      return true;
    });
  });

  test('lança {status:400} para senha vazia', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.login('user@test.com', ''), (err) => {
      assert.strictEqual(err.status, 400);
      return true;
    });
    await assert.rejects(() => svc.login('user@test.com', '   '), (err) => {
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('lança {status:401} com mensagem GENÉRICA para credenciais inválidas (anti-exposição)', async () => {
    const svc = new AuthService(criarSupabaseMock({ loginOk: false }));
    await assert.rejects(() => svc.login('user@test.com', 'Senha1!ok'), (err) => {
      assert.strictEqual(err.status, 401);
      // NUNCA deve expor a mensagem interna do Supabase
      assert.ok(!err.message.includes('Invalid login credentials'));
      assert.match(err.message, /inválid|credencial/i);
      return true;
    });
  });

  test('retorna tokens e userId para credenciais válidas', async () => {
    const svc    = new AuthService(criarSupabaseMock());
    const result = await svc.login('user@test.com', 'Senha1!ok');
    assert.strictEqual(result.userId,       UUID_USER);
    assert.strictEqual(result.accessToken,  SESSAO_MOCK.access_token);
    assert.strictEqual(result.refreshToken, SESSAO_MOCK.refresh_token);
    assert.ok(typeof result.expiresAt === 'number');
  });

  test('nunca retorna campo "senha" ou "password" no resultado', async () => {
    const svc    = new AuthService(criarSupabaseMock());
    const result = await svc.login('user@test.com', 'Senha1!ok');
    assert.ok(!('senha'    in result));
    assert.ok(!('password' in result));
  });
});

suite('AuthService.renovarToken()', () => {

  test('lança {status:400} para refresh token vazio ou nulo', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.renovarToken(''),   (err) => err.status === 400 && true);
    await assert.rejects(() => svc.renovarToken(null), (err) => err.status === 400 && true);
  });

  test('lança {status:401} para refresh token inválido/expirado', async () => {
    const svc = new AuthService(criarSupabaseMock({ refreshOk: false }));
    await assert.rejects(() => svc.renovarToken('rt-invalido'), (err) => {
      assert.strictEqual(err.status, 401);
      return true;
    });
  });

  test('retorna novos tokens para refresh token válido', async () => {
    const svc    = new AuthService(criarSupabaseMock());
    const result = await svc.renovarToken('rt-valido');
    assert.strictEqual(result.accessToken,  SESSAO_MOCK.access_token);
    assert.strictEqual(result.refreshToken, SESSAO_MOCK.refresh_token);
    assert.ok(typeof result.expiresAt === 'number');
  });
});

suite('AuthService.logout()', () => {

  test('chama admin.signOut com o token e scope local', async () => {
    const mock = criarSupabaseMock();
    const svc  = new AuthService(mock);
    await svc.logout('meu-access-token');
    const chamadas = mock.auth.admin.signOut.calls;
    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(chamadas[0][0], 'meu-access-token');
    assert.strictEqual(chamadas[0][1], 'local');
  });

  test('resolve sem erro mesmo se accessToken vazio (tolerante)', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.doesNotReject(() => svc.logout(''));
    await assert.doesNotReject(() => svc.logout(null));
  });

  test('resolve sem lançar mesmo se admin.signOut falhar', async () => {
    const svc = new AuthService(criarSupabaseMock({ signOutError: new Error('network') }));
    await assert.doesNotReject(() => svc.logout('meu-token'));
  });
});

suite('AuthService.alterarSenha()', () => {

  test('lança {status:400} para userId inválido (não-UUID)', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.alterarSenha('nao-uuid', 'Nova1Senha!'), (err) => {
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('lança {status:400} para senha fraca', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.alterarSenha(UUID_USER, 'fraca'), (err) => {
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('chama admin.updateUserById com userId e nova senha', async () => {
    const mock = criarSupabaseMock();
    const svc  = new AuthService(mock);
    await svc.alterarSenha(UUID_USER, 'NovaSenha1!');
    const chamadas = mock.auth.admin.updateUserById.calls;
    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(chamadas[0][0], UUID_USER);
    assert.ok('password' in chamadas[0][1]);
  });
});

suite('AuthService.solicitarResetSenha()', () => {

  test('lança {status:400} para formato de e-mail inválido', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.rejects(() => svc.solicitarResetSenha('invalido'), (err) => {
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('resolve com sucesso para e-mail com formato válido', async () => {
    const svc = new AuthService(criarSupabaseMock());
    await assert.doesNotReject(() => svc.solicitarResetSenha('user@test.com'));
  });

  test('NUNCA lança erro do Supabase (anti-enumeração: email pode não existir)', async () => {
    // Mesmo que Supabase retorne erro (email não cadastrado), o service deve resolver silenciosamente
    const svc = new AuthService(criarSupabaseMock({ resetPwdOk: false }));
    await assert.doesNotReject(() => svc.solicitarResetSenha('nao@existe.com'));
  });
});
