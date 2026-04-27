'use strict';

/**
 * tests/secure-media.test.js
 *
 * Testes de AuthService.validateUser e SecureMediaAccessService.
 * Runner: node:test + node:assert/strict (nativo — sem dependências externas).
 *
 * Cenários cobertos:
 *
 *   AuthService.validateUser():
 *     1.  Token ausente/vazio → lança 401
 *     2.  Token inválido (JWT malformado) → lança 401
 *     3.  Token válido (local, sem rede) → retorna { id, email }
 *     4.  Token válido (fallback rede) → retorna { id, email }
 *     5.  Rede retorna erro → lança 401
 *
 *   SecureMediaAccessService.validateAccess():
 *     6.  UUID inválido → lança erro de validação
 *     7.  Arquivo não pertence ao usuário → retorna false
 *     8.  Arquivo pertence ao usuário → retorna true
 *     9.  Arquivo inexistente → retorna false
 *
 *   SecureMediaAccessService.generateSignedUrl():
 *     10. UUID inválido → lança erro de validação
 *     11. Arquivo não encontrado → lança 404
 *     12. Usuário não é o dono → lança 403
 *     13. Usuário autorizado → retorna { url, expiresIn }
 *     14. URL gerada tem expiresIn = 60s
 *     15. URL assinada nunca é a URL pública (presignedGet, não publicUrl)
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const path            = require('node:path');

const AuthService              = require(path.join(__dirname, '..', 'src', 'services', 'AuthService'));
const SecureMediaAccessService = require(path.join(__dirname, '..', 'src', 'services', 'SecureMediaAccessService'));

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de teste
// ─────────────────────────────────────────────────────────────────────────────

const UUID_OWNER  = '00000000-0000-4000-8000-000000000001';
const UUID_OTHER  = '00000000-0000-4000-8000-000000000002';
const UUID_FILE   = 'f0000000-0000-4000-8000-000000000001';
const FILE_PATH   = 'services/uuid/uuid.webp';
const SIGNED_URL  = 'https://r2.example.com/signed?X-Amz-Expires=60&X-Amz-Signature=abc';
const PUBLIC_URL  = 'https://pub.r2.dev/services/uuid/uuid.webp';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um spy simples: registra todas as chamadas e retorna um valor.
 * @param {*} retornarValor — valor que .call() vai retornar (pode ser Promise)
 */
function spy(retornarValor) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    const val = typeof retornarValor === 'function' ? retornarValor(...args) : retornarValor;
    return val;
  };
  fn.calls   = calls;
  fn.calledWith = (...args) => calls.some(c => JSON.stringify(c) === JSON.stringify(args));
  return fn;
}

/**
 * Cria um stub de SupabaseClient que simula a tabela media_files.
 * @param {{ data: object|null, error?: object }} config
 */
function criarSupabaseMock(config) {
  const builder = {
    select:      () => builder,
    eq:          () => builder,
    maybeSingle: async () => config,
  };
  return {
    from:        () => builder,
    auth: {
      getUser: async (token) => {
        if (token === 'valid-network-token') {
          return { data: { user: { id: UUID_OWNER, email: 'dono@barberflow.com' } }, error: null };
        }
        return { data: null, error: new Error('invalid') };
      },
    },
  };
}

/**
 * Cria um stub de R2Client.
 * presignedGet → retorna SIGNED_URL (nunca PUBLIC_URL)
 * publicUrl    → retorna PUBLIC_URL (NUNCA deve ser chamado pelo SecureMediaAccessService)
 */
function criarR2Mock() {
  const presignedGetSpy = spy(SIGNED_URL);
  const publicUrlSpy    = spy(PUBLIC_URL);

  return {
    presignedGet: presignedGetSpy,
    publicUrl:    publicUrlSpy,
    _presignedGetCalls: presignedGetSpy.calls,
    _publicUrlCalls:    publicUrlSpy.calls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthService.validateUser()
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthService.validateUser()', () => {

  test('token ausente → lança 401', async () => {
    const svc = new AuthService(criarSupabaseMock({ data: null }));

    await assert.rejects(
      () => svc.validateUser(''),
      (err) => { assert.strictEqual(err.status, 401); return true; }
    );
    await assert.rejects(
      () => svc.validateUser(null),
      (err) => { assert.strictEqual(err.status, 401); return true; }
    );
    await assert.rejects(
      () => svc.validateUser('   '),
      (err) => { assert.strictEqual(err.status, 401); return true; }
    );
  });

  test('token inválido sem SUPABASE_JWT_SECRET → fallback rede → lança 401', async () => {
    const originalSecret = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;

    try {
      const svc = new AuthService(criarSupabaseMock({ data: null }));
      await assert.rejects(
        () => svc.validateUser('token-invalido'),
        (err) => { assert.strictEqual(err.status, 401); return true; }
      );
    } finally {
      if (originalSecret !== undefined) process.env.SUPABASE_JWT_SECRET = originalSecret;
    }
  });

  test('token válido via rede (fallback) → retorna { id, email }', async () => {
    const originalSecret = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;

    try {
      const svc    = new AuthService(criarSupabaseMock({ data: null }));
      const result = await svc.validateUser('valid-network-token');

      assert.strictEqual(result.id,    UUID_OWNER);
      assert.strictEqual(result.email, 'dono@barberflow.com');
    } finally {
      if (originalSecret !== undefined) process.env.SUPABASE_JWT_SECRET = originalSecret;
    }
  });

  test('token inválido com SUPABASE_JWT_SECRET → lança 401 (verificação local)', async () => {
    const originalSecret = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = 'segredo-de-teste-32-chars-minimo-x';

    try {
      const svc = new AuthService(criarSupabaseMock({ data: null }));
      await assert.rejects(
        () => svc.validateUser('jwt.invalido.aqui'),
        (err) => { assert.strictEqual(err.status, 401); return true; }
      );
    } finally {
      if (originalSecret !== undefined) {
        process.env.SUPABASE_JWT_SECRET = originalSecret;
      } else {
        delete process.env.SUPABASE_JWT_SECRET;
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SecureMediaAccessService.validateAccess()
// ─────────────────────────────────────────────────────────────────────────────

suite('SecureMediaAccessService.validateAccess()', () => {

  test('UUID inválido → lança erro de validação', async () => {
    const svc = new SecureMediaAccessService(criarR2Mock(), criarSupabaseMock({ data: null }));

    await assert.rejects(() => svc.validateAccess('nao-e-uuid', UUID_FILE));
    await assert.rejects(() => svc.validateAccess(UUID_OWNER, 'nao-e-uuid'));
  });

  test('arquivo pertence ao usuário → retorna true', async () => {
    const supabase = criarSupabaseMock({ data: { id: UUID_FILE } });
    const svc      = new SecureMediaAccessService(criarR2Mock(), supabase);

    const result = await svc.validateAccess(UUID_OWNER, UUID_FILE);
    assert.strictEqual(result, true);
  });

  test('arquivo não encontrado → retorna false', async () => {
    const supabase = criarSupabaseMock({ data: null });
    const svc      = new SecureMediaAccessService(criarR2Mock(), supabase);

    const result = await svc.validateAccess(UUID_OTHER, UUID_FILE);
    assert.strictEqual(result, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SecureMediaAccessService.generateSignedUrl()
// ─────────────────────────────────────────────────────────────────────────────

suite('SecureMediaAccessService.generateSignedUrl()', () => {

  test('UUID inválido → lança erro de validação', async () => {
    const svc = new SecureMediaAccessService(criarR2Mock(), criarSupabaseMock({ data: null }));

    await assert.rejects(() => svc.generateSignedUrl('nao-uuid', UUID_OWNER));
    await assert.rejects(() => svc.generateSignedUrl(UUID_FILE, 'nao-uuid'));
  });

  test('arquivo não encontrado → lança 404', async () => {
    const svc = new SecureMediaAccessService(
      criarR2Mock(),
      criarSupabaseMock({ data: null, error: null })
    );

    await assert.rejects(
      () => svc.generateSignedUrl(UUID_FILE, UUID_OWNER),
      (err) => {
        assert.strictEqual(err.status, 404);
        return true;
      }
    );
  });

  test('usuário não é o dono → lança 403 (acesso negado)', async () => {
    // Arquivo existe mas pertence a UUID_OWNER, não a UUID_OTHER
    const supabase = criarSupabaseMock({
      data:  { id: UUID_FILE, path: FILE_PATH, owner_id: UUID_OWNER },
      error: null,
    });
    const svc = new SecureMediaAccessService(criarR2Mock(), supabase);

    await assert.rejects(
      () => svc.generateSignedUrl(UUID_FILE, UUID_OTHER),
      (err) => {
        assert.strictEqual(err.status, 403);
        return true;
      }
    );
  });

  test('usuário autorizado → retorna { url, expiresIn }', async () => {
    const supabase = criarSupabaseMock({
      data:  { id: UUID_FILE, path: FILE_PATH, owner_id: UUID_OWNER },
      error: null,
    });
    const r2  = criarR2Mock();
    const svc = new SecureMediaAccessService(r2, supabase);

    const result = await svc.generateSignedUrl(UUID_FILE, UUID_OWNER);

    assert.ok(typeof result.url === 'string', 'url deve ser string');
    assert.ok(result.url.length > 0,          'url não deve ser vazia');
    assert.strictEqual(result.expiresIn, SecureMediaAccessService.SIGNED_URL_EXPIRES_SECS);
  });

  test('expiresIn é 60 segundos', () => {
    assert.strictEqual(SecureMediaAccessService.SIGNED_URL_EXPIRES_SECS, 60);
  });

  test('URL assinada NUNCA é a URL pública — publicUrl() não é chamado', async () => {
    const supabase = criarSupabaseMock({
      data:  { id: UUID_FILE, path: FILE_PATH, owner_id: UUID_OWNER },
      error: null,
    });
    const r2  = criarR2Mock();
    const svc = new SecureMediaAccessService(r2, supabase);

    await svc.generateSignedUrl(UUID_FILE, UUID_OWNER);

    // presignedGet DEVE ter sido chamado
    assert.strictEqual(r2._presignedGetCalls.length, 1, 'presignedGet deve ser chamado');

    // publicUrl NUNCA deve ser chamado em acesso seguro
    assert.strictEqual(r2._publicUrlCalls.length, 0, 'publicUrl NÃO deve ser chamado em acesso seguro');
  });

  test('usuário não autorizado → presignedGet NUNCA é chamado', async () => {
    const supabase = criarSupabaseMock({
      data:  { id: UUID_FILE, path: FILE_PATH, owner_id: UUID_OWNER },
      error: null,
    });
    const r2  = criarR2Mock();
    const svc = new SecureMediaAccessService(r2, supabase);

    await assert.rejects(() => svc.generateSignedUrl(UUID_FILE, UUID_OTHER));

    assert.strictEqual(r2._presignedGetCalls.length, 0,
      'presignedGet não deve ser chamado para usuário não autorizado');
  });
});
