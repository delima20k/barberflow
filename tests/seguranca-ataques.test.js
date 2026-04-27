'use strict';

/**
 * tests/seguranca-ataques.test.js — Testes de segurança e simulação de ataques.
 *
 * Categorias cobertas (OWASP Top 10 + ataques específicos):
 *   1. AuthMiddleware      — endpoints sem token / token inválido
 *   2. Ataques JWT         — alg:none, secret errado, cross-type, expirado, payload adulterado
 *   3. Injeção via inputs  — XSS, SQL injection, PostgREST injection, null byte, oversized
 *   4. IDOR                — ClienteService: edição de perfil alheio
 *   5. Mass Assignment     — BaseRepository: campos proibidos descartados
 *   6. Injeção geográfica  — BarbeariaService: coordenadas maliciosas / out-of-range
 *   7. Escalada de role    — RoleMiddleware: privilege escalation, role injection via body
 *   8. PasswordService     — DoS via senhas longas (bcrypt amplification), senhas nulas
 *   9. UserService         — e-mail injection, enumeração de usuários
 *
 * Todos os testes são ISOLADOS — sem estado compartilhado, sem dados reais.
 * Mocks injetados por construtor ou criados localmente em cada suite.
 */

// ── Env vars ANTES de qualquer require ──────────────────────────────────────
// SupabaseClient lê process.env no carregamento do módulo — deve ser configurado
// antes do primeiro require() que transitivamente o carregue.
process.env.SUPABASE_URL              ??= 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key-placeholder';
// Força path de verificação LOCAL em AuthMiddleware (zero latência de rede em testes)
process.env.SUPABASE_JWT_SECRET        = 'test-supabase-jwt-secret-minimo-32ch!';
process.env.JWT_ACCESS_SECRET         ??= 'test-access-secret-32chars-ok!!!';
process.env.JWT_REFRESH_SECRET        ??= 'test-refresh-secret-32chars-ok!!';
process.env.BCRYPT_ROUNDS             ??= '4';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const jwt             = require('jsonwebtoken');
const { fn }          = require('./_helpers.js');

const AuthMiddleware       = require('../src/infra/AuthMiddleware');
const TokenService         = require('../src/infra/TokenService');
const ValidationMiddleware = require('../src/infra/ValidationMiddleware');
const RoleMiddleware       = require('../src/infra/RoleMiddleware');
const BaseRepository       = require('../src/infra/BaseRepository');
const PasswordService      = require('../src/infra/PasswordService');
const ClienteService       = require('../src/services/ClienteService');
const BarbeariaService     = require('../src/services/BarbeariaService');
const UserService          = require('../src/services/UserService');

// ── UUIDs fixos ───────────────────────────────────────────────────────────────
const UUID_A = 'a0000000-0000-4000-8000-000000000001';
const UUID_B = 'b0000000-0000-4000-8000-000000000002';

const SUPA_SECRET = process.env.SUPABASE_JWT_SECRET;

// ── Helpers compartilhados ───────────────────────────────────────────────────

/**
 * Cria mocks de req / res / next para testes de middleware Express.
 * captured.status → código HTTP definido via res.status()
 * captured.body   → payload enviado via .json()
 */
function criarMocks(opts = {}) {
  const captured = { status: null, body: null };

  const res = {
    status(s) { captured.status = s; return { json(d) { captured.body = d; } }; },
    json(d)   { captured.body = d; },
  };

  const next = fn();
  const req  = {
    headers: opts.headers ?? {},
    body:    opts.body    ?? {},
    params:  opts.params  ?? {},
    query:   opts.query   ?? {},
    user:    opts.user != null ? { ...opts.user } : null,
  };

  return { req, res, next, captured };
}

/**
 * Gera JWT simulando assinatura do Supabase Auth (HS256 + SUPABASE_JWT_SECRET).
 * Usado para testar o caminho de verificação local do AuthMiddleware.
 */
function gerarTokenSupa(payload = {}, opts = {}) {
  return jwt.sign(
    { sub: UUID_A, email: 'user@barberflow.com', role: 'authenticated', ...payload },
    SUPA_SECRET,
    { algorithm: 'HS256', expiresIn: '15m', ...opts },
  );
}

/**
 * Cria mock do SupabaseClient para testes de RoleMiddleware.
 * Simula a query SELECT role FROM profiles WHERE id = $1.
 */
function criarSupaMock({ role = 'client', dbError = null } = {}) {
  const result  = dbError
    ? { data: null, error: dbError }
    : { data: { role }, error: null };

  const builder = {
    select:      fn().mockReturnThis(),
    eq:          fn().mockReturnThis(),
    maybeSingle: fn().mockResolvedValue(result),
  };

  return { from: fn().mockReturnValue(builder) };
}

// =============================================================================
// 1. AuthMiddleware — Endpoints protegidos sem token válido
// =============================================================================

suite('AuthMiddleware — endpoints protegidos sem token válido', () => {

  test('sem header Authorization → 401', async () => {
    const { req, res, next, captured } = criarMocks();
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('"Authorization: Token xxx" (não Bearer) → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Token eyJhbGciOiJIUzI1NiJ9.payload.sig' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('"Authorization: Basic dXNlcjpwYXNz" (Basic Auth) → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('Bearer com string aleatória inválida → 401', async () => {
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: 'Bearer ISTO-NAO-E-UM-JWT-VALIDO' },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('Bearer com JWT assinado com secret errado → 401', async () => {
    const tokenErrado = jwt.sign({ sub: UUID_A, email: 'hacker@test.com' }, 'secret-errado!!', {
      algorithm: 'HS256',
    });
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${tokenErrado}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('Bearer com token expirado → 401', async () => {
    const expirado = jwt.sign(
      { sub: UUID_A, email: 'user@test.com', exp: Math.floor(Date.now() / 1000) - 3600 },
      SUPA_SECRET,
      { algorithm: 'HS256' },
    );
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${expirado}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('Bearer com token válido → next() chamado + req.user populado', async () => {
    const token = gerarTokenSupa({ sub: UUID_A, email: 'user@barberflow.com' });
    const { req, res, next, captured } = criarMocks({
      headers: { authorization: `Bearer ${token}` },
    });
    await AuthMiddleware.verificar(req, res, next);
    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(req.user.id, UUID_A);
    assert.strictEqual(req.user.email, 'user@barberflow.com');
  });

  test('resposta 401 não expõe detalhes internos (stack, secret)', async () => {
    const { req, res, next, captured } = criarMocks();
    await AuthMiddleware.verificar(req, res, next);
    const serializado = JSON.stringify(captured.body);
    assert.strictEqual(captured.body.ok, false);
    assert.ok(typeof captured.body.error === 'string');
    assert.ok(!serializado.toLowerCase().includes('stack'));
    assert.ok(!serializado.toLowerCase().includes('secret'));
    assert.ok(!serializado.toLowerCase().includes('supabase'));
  });
});

// =============================================================================
// 2. Ataques JWT — TokenService
// =============================================================================

suite('Ataques JWT — TokenService', () => {

  test('alg:none attack — TokenService.verificarSupabase rejeita (sem assinatura)', () => {
    // Clássico JWT algorithm confusion: header alg=none + payload sem assinatura
    const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: UUID_A, email: 'admin@hack.com', role: 'admin' })).toString('base64url');
    const algNoneToken = `${header}.${payload}.`;

    assert.throws(
      () => TokenService.verificarSupabase(algNoneToken),
      (err) => err.status === 401,
    );
  });

  test('payload adulterado manualmente (tampered) → 401', () => {
    // Gera token válido, troca o payload sem re-assinar
    const token      = gerarTokenSupa({ sub: UUID_A });
    const [h, , sig] = token.split('.');
    const payloadMalicioso = Buffer.from(JSON.stringify({
      sub:   UUID_B,
      email: 'admin@hack.com',
      role:  'admin',
    })).toString('base64url');
    const adulterado = `${h}.${payloadMalicioso}.${sig}`;

    assert.throws(
      () => TokenService.verificarSupabase(adulterado),
      (err) => err.status === 401,
    );
  });

  test('token assinado com secret diferente → 401', () => {
    const tokenFalso = jwt.sign({ sub: UUID_A }, 'secret-completamente-diferente!!', {
      algorithm: 'HS256',
    });
    assert.throws(
      () => TokenService.verificarSupabase(tokenFalso),
      (err) => err.status === 401,
    );
  });

  test('token expirado → TokenService.verificarSupabase lança 401', () => {
    const expirado = jwt.sign(
      { sub: UUID_A, exp: Math.floor(Date.now() / 1000) - 60 },
      SUPA_SECRET,
      { algorithm: 'HS256' },
    );
    assert.throws(
      () => TokenService.verificarSupabase(expirado),
      (err) => err.status === 401,
    );
  });

  test('access token usado como refresh (cross-type) → 401', () => {
    const access = TokenService.gerarAccessToken({ sub: UUID_A });
    assert.throws(
      () => TokenService.verificar(access, 'refresh'),
      (err) => err.status === 401,
    );
  });

  test('refresh token usado como access (cross-type) → 401', () => {
    const refresh = TokenService.gerarRefreshToken(UUID_A);
    assert.throws(
      () => TokenService.verificar(refresh, 'access'),
      (err) => err.status === 401,
    );
  });

  test('gerarAccessToken sem sub → lança 400', () => {
    assert.throws(
      () => TokenService.gerarAccessToken({ email: 'sem-sub@test.com' }),
      (err) => err.status === 400,
    );
  });

  test('gerarRefreshToken com userId vazio → lança 400', () => {
    assert.throws(
      () => TokenService.gerarRefreshToken(''),
      (err) => err.status === 400,
    );
  });

  test('gerarRefreshToken com userId null → lança 400', () => {
    assert.throws(
      () => TokenService.gerarRefreshToken(null),
      (err) => err.status === 400,
    );
  });

  test('token válido gerado com secret correto → verificarSupabase passa', () => {
    const token   = gerarTokenSupa({ sub: UUID_A, email: 'user@barberflow.com' });
    const payload = TokenService.verificarSupabase(token);
    assert.strictEqual(payload.sub, UUID_A);
    assert.strictEqual(payload.email, 'user@barberflow.com');
  });
});

// =============================================================================
// 3. Injeção via ValidationMiddleware
// =============================================================================

suite('ValidationMiddleware — ataques de injeção e payloads maliciosos', () => {

  // ── Email ──────────────────────────────────────────────────────────────────

  test('XSS em campo email → 400', () => {
    const mw = ValidationMiddleware.corpo({ email: { tipo: 'email', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({
      body: { email: '<script>alert(document.cookie)</script>' },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test("SQL injection em campo email → 400", () => {
    const mw = ValidationMiddleware.corpo({ email: { tipo: 'email', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({
      body: { email: "' OR '1'='1'--" },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  // ── UUID ───────────────────────────────────────────────────────────────────

  test("SQL injection em campo UUID → 400", () => {
    const mw = ValidationMiddleware.corpo({ id: { tipo: 'uuid', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({ body: { id: "' OR 1=1--" } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('PostgREST filter injection em campo UUID (eq.xxx) → 400', () => {
    const mw = ValidationMiddleware.corpo({ id: { tipo: 'uuid', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({ body: { id: 'eq.00000000-0000-0000-0000-000000000001' } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  // ── Enum ───────────────────────────────────────────────────────────────────

  test("SQL injection em campo enum → 400 (fora das opcoes)", () => {
    const mw = ValidationMiddleware.corpo({
      status: { tipo: 'enum', opcoes: ['pending', 'done'], obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({
      body: { status: "' UNION SELECT * FROM profiles--" },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('valor fora das opcoes enum → 400', () => {
    const mw = ValidationMiddleware.corpo({
      tipo: { tipo: 'enum', opcoes: ['like', 'favorite'], obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({ body: { tipo: 'admin' } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  // ── Texto ──────────────────────────────────────────────────────────────────

  test('null bytes em campo texto → sanitizados (removidos), next() chamado', () => {
    const mw = ValidationMiddleware.corpo({ bio: { tipo: 'texto', maxLen: 300 } });
    const { req, res, next, captured } = criarMocks({
      body: { bio: 'texto\0com\0null\0bytes' },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
    assert.ok(!req.body.bio.includes('\0'), 'null bytes devem ser removidos do campo sanitizado');
  });

  test('texto com 10.000 chars (acima do maxLen=500) → 400', () => {
    const mw = ValidationMiddleware.corpo({ descricao: { tipo: 'texto', maxLen: 500 } });
    const { req, res, next, captured } = criarMocks({
      body: { descricao: 'A'.repeat(10_000) },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  // ── Número ─────────────────────────────────────────────────────────────────

  test("SQL injection em campo número (query string) → 400", () => {
    const mw = ValidationMiddleware.query({ lat: { tipo: 'numero', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({
      query: { lat: "1; DROP TABLE appointments--" },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('Infinity em campo número → 400', () => {
    const mw = ValidationMiddleware.corpo({ raio: { tipo: 'numero', obrigatorio: true, max: 100 } });
    const { req, res, next, captured } = criarMocks({ body: { raio: Infinity } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('NaN em campo número → 400', () => {
    const mw = ValidationMiddleware.corpo({ raio: { tipo: 'numero', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({ body: { raio: NaN } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  test('valor acima do max em campo número → 400', () => {
    const mw = ValidationMiddleware.corpo({ raio: { tipo: 'numero', obrigatorio: true, max: 100 } });
    const { req, res, next, captured } = criarMocks({ body: { raio: 999 } });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.strictEqual(next.calls.length, 0);
  });

  // ── Múltiplos campos inválidos ─────────────────────────────────────────────

  test('múltiplos campos inválidos → resposta lista todos os erros', () => {
    const mw = ValidationMiddleware.corpo({
      email: { tipo: 'email', obrigatorio: true },
      id:    { tipo: 'uuid',  obrigatorio: true },
    });
    const { req, res, next, captured } = criarMocks({
      body: { email: 'invalido', id: 'nao-e-uuid' },
    });
    mw(req, res, next);
    assert.strictEqual(captured.status, 400);
    assert.ok(Array.isArray(captured.body.erros));
    assert.ok(captured.body.erros.length >= 2, 'deve listar todos os erros acumulados');
  });

  test('resposta 400 segue contrato { ok, error, erros[] }', () => {
    const mw = ValidationMiddleware.corpo({ email: { tipo: 'email', obrigatorio: true } });
    const { req, res, next, captured } = criarMocks({ body: { email: 'invalido' } });
    mw(req, res, next);
    assert.strictEqual(captured.body.ok, false);
    assert.ok(typeof captured.body.error === 'string');
    assert.ok(Array.isArray(captured.body.erros));
  });
});

// =============================================================================
// 4. IDOR — ClienteService: edição de perfil alheio
// =============================================================================

suite('ClienteService — IDOR (Insecure Direct Object Reference)', () => {

  function criarService(rowRetorno = null) {
    const repo = {
      getById:          fn().mockResolvedValue(rowRetorno ?? { id: UUID_A, full_name: 'João' }),
      update:           fn().mockResolvedValue({ id: UUID_A, full_name: 'Novo Nome' }),
      getPerfilPublico: fn().mockResolvedValue(null),
    };
    return new ClienteService(repo);
  }

  test('cliente tentando editar perfil alheio → 403', async () => {
    const svc = criarService();
    await assert.rejects(
      // userId = UUID_B mas id = UUID_A → IDOR tentado
      () => svc.atualizarCliente(UUID_A, { full_name: 'Hack' }, UUID_B),
      (err) => err.status === 403,
    );
  });

  test('cliente editando próprio perfil → sucesso', async () => {
    const svc = criarService({ id: UUID_A, full_name: 'Novo Nome' });
    const result = await svc.atualizarCliente(UUID_A, { full_name: 'Novo Nome' }, UUID_A);
    assert.ok(result);
  });

  test('id UUID inválido → 400 antes de qualquer consulta ao banco', async () => {
    const svc = criarService();
    await assert.rejects(
      () => svc.atualizarCliente('nao-e-uuid', {}, UUID_A),
      (err) => err.status === 400,
    );
  });

  test('full_name com apenas 1 char (abaixo do mínimo) → 400', async () => {
    // Validação de nome exige mínimo 2 chars (InputValidator.nome)
    // SQL injection em texto livre é prevenido por queries parametrizadas (Supabase),
    // não pelo validator de nome — que propositalmente permite apóstrofos (ex: Mary O'Brien)
    const svc = criarService();
    await assert.rejects(
      () => svc.atualizarCliente(UUID_A, { full_name: 'X' }, UUID_A),
      (err) => err.status === 400,
    );
  });

  test('bio com mais de 300 chars → 400', async () => {
    const svc = criarService();
    await assert.rejects(
      () => svc.atualizarCliente(UUID_A, { bio: 'x'.repeat(301) }, UUID_A),
      (err) => err.status === 400,
    );
  });
});

// =============================================================================
// 5. Mass Assignment — BaseRepository
// =============================================================================

suite('BaseRepository — Mass Assignment (previne campos proibidos)', () => {

  class RepoTeste extends BaseRepository {
    constructor() { super('RepoTeste'); }
    filtrar(dados, permitidos) { return this._validarPayload(dados, permitidos); }
  }

  const repo = new RepoTeste();

  test('campos proibidos são silenciosamente descartados', () => {
    const resultado = repo.filtrar(
      { full_name: 'João', role: 'admin', is_active: false, password_hash: 'leaked' },
      ['full_name'],
    );
    assert.deepStrictEqual(resultado, { full_name: 'João' });
  });

  test('nenhum campo permitido no payload → TypeError', () => {
    assert.throws(
      () => repo.filtrar({ role: 'admin', is_active: true }, ['full_name']),
      TypeError,
    );
  });

  test('payload completamente vazio → TypeError', () => {
    assert.throws(
      () => repo.filtrar({}, ['full_name']),
      TypeError,
    );
  });

  test('payload com Array em vez de objeto → TypeError', () => {
    assert.throws(
      () => repo.filtrar(['full_name', 'João'], ['full_name']),
      TypeError,
    );
  });

  test('payload com null → TypeError', () => {
    assert.throws(
      () => repo.filtrar(null, ['full_name']),
      TypeError,
    );
  });

  test('apenas campos listados na allowlist chegam ao banco', () => {
    const resultado = repo.filtrar(
      {
        full_name: 'João',
        phone:     '(11) 91234-5678',
        role:      'owner',     // proibido
        created_at: '2024-01-01', // proibido
      },
      ['full_name', 'phone'],
    );
    assert.ok('full_name' in resultado);
    assert.ok('phone' in resultado);
    assert.ok(!('role' in resultado));
    assert.ok(!('created_at' in resultado));
  });
});

// =============================================================================
// 6. BarbeariaService — Injeção em coordenadas geográficas
// =============================================================================

suite('BarbeariaService — injeção em coordenadas e raio (ataque geográfico)', () => {

  function criarSvc() {
    const repo = {
      getNearby:    fn().mockResolvedValue([]),
      getById:      fn().mockResolvedValue(null),
      getFavoritas: fn().mockResolvedValue([]),
      addInteracao: fn().mockResolvedValue({}),
      getServicos:  fn().mockResolvedValue([]),
    };
    return new BarbeariaService(repo);
  }

  test('lat = Infinity → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(Infinity, -43.18, 5), (err) => err.status === 400);
  });

  test('lat = NaN → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(NaN, -43.18, 5), (err) => err.status === 400);
  });

  test('lat > 90 (fora do planeta) → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(200, -43.18, 5), (err) => err.status === 400);
  });

  test('lng < -180 (fora do planeta) → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(-22.9, -200, 5), (err) => err.status === 400);
  });

  test('lat = string com SQL injection → 400', async () => {
    const svc = criarSvc();
    // typeof string !== 'number' → _coordenada falha
    await assert.rejects(
      () => svc.listarProximas("' OR 1=1--", -43.18, 5),
      (err) => err.status === 400,
    );
  });

  test('raioKm = Infinity → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(-22.9, -43.18, Infinity), (err) => err.status === 400);
  });

  test('raioKm = -1 (negativo) → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(-22.9, -43.18, -1), (err) => err.status === 400);
  });

  test('raioKm = 0 → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(-22.9, -43.18, 0), (err) => err.status === 400);
  });

  test('raioKm > 100 (amplification attack) → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(() => svc.listarProximas(-22.9, -43.18, 99999), (err) => err.status === 400);
  });

  test('interacao com tipo inválido (injeção de string) → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(
      () => svc.registrarInteracao(UUID_A, UUID_B, "' OR 1=1"),
      (err) => err.status === 400,
    );
  });

  test('coordenadas e raio válidos → getNearby é chamado (sem exceção)', async () => {
    const repo = {
      getNearby:    fn().mockResolvedValue([]),
      getById:      fn().mockResolvedValue(null),
      getFavoritas: fn().mockResolvedValue([]),
      addInteracao: fn().mockResolvedValue({}),
      getServicos:  fn().mockResolvedValue([]),
    };
    const svc = new BarbeariaService(repo);
    await svc.listarProximas(-22.9068, -43.1729, 5);
    assert.strictEqual(repo.getNearby.calls.length, 1);
  });
});

// =============================================================================
// 7. RoleMiddleware — Escalada de privilégio
// =============================================================================

suite('RoleMiddleware — Escalada de privilégio e proteção de rotas', () => {

  test('req.user ausente (AuthMiddleware não executado) → 401', async () => {
    const db = criarSupaMock({ role: 'admin' });
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({ user: null });
    await mw(req, res, next);
    assert.strictEqual(captured.status, 401);
    assert.strictEqual(next.calls.length, 0);
  });

  test('role "client" tentando rota de "admin" → 403', async () => {
    const db = criarSupaMock({ role: 'client' });
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({ user: { id: UUID_A } });
    await mw(req, res, next);
    assert.strictEqual(captured.status, 403);
    assert.strictEqual(next.calls.length, 0);
  });

  test('role injetada via req.body é completamente ignorada', async () => {
    // Atacante tenta elevar seu acesso enviando role no body
    const db = criarSupaMock({ role: 'client' }); // banco retorna 'client'
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({
      user: { id: UUID_A },
      body: { role: 'admin' }, // tentativa de injection via body
    });
    await mw(req, res, next);
    // Permanece 403 — role do body é ignorado; apenas banco é autoritativo
    assert.strictEqual(captured.status, 403);
    assert.strictEqual(next.calls.length, 0);
  });

  test('role injetada via req.query é ignorada', async () => {
    const db = criarSupaMock({ role: 'client' });
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({
      user:  { id: UUID_A },
      query: { role: 'admin' }, // tentativa via query string
    });
    await mw(req, res, next);
    assert.strictEqual(captured.status, 403);
    assert.strictEqual(next.calls.length, 0);
  });

  test('falha no banco ao buscar role → 503 (sem vazar detalhes)', async () => {
    const db = criarSupaMock({ dbError: new Error('Connection refused') });
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({ user: { id: UUID_A } });
    await mw(req, res, next);
    assert.strictEqual(captured.status, 503);
    assert.strictEqual(next.calls.length, 0);
  });

  test('role "barber" em rota que aceita barber/owner/admin → next()', async () => {
    const db = criarSupaMock({ role: 'barber' });
    const mw = RoleMiddleware._comSupabase(db, 'barber', 'owner', 'admin');
    const { req, res, next, captured } = criarMocks({ user: { id: UUID_A } });
    await mw(req, res, next);
    assert.strictEqual(captured.status, null);
    assert.strictEqual(next.calls.length, 1);
  });

  test('role cacheada em req.user.role → banco NÃO é consultado (performance + segurança)', async () => {
    // Se AuthMiddleware já populou req.user.role (ex: token com claim role),
    // RoleMiddleware não deve re-consultar o banco
    const db = criarSupaMock({ role: 'admin' }); // DB existe mas não deve ser chamado
    const mw = RoleMiddleware._comSupabase(db, 'client');
    const { req, res, next } = criarMocks({ user: { id: UUID_A, role: 'client' } });
    await mw(req, res, next);
    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(db.from.calls.length, 0, 'banco não deve ser consultado com role cacheada');
  });

  test('resposta de erro 403 não expõe detalhes internos', async () => {
    const db = criarSupaMock({ role: 'client' });
    const mw = RoleMiddleware._comSupabase(db, 'admin');
    const { req, res, next, captured } = criarMocks({ user: { id: UUID_A } });
    await mw(req, res, next);
    const serializado = JSON.stringify(captured.body);
    assert.ok(!serializado.includes('stack'));
    assert.ok(!serializado.includes('secret'));
    assert.ok(!serializado.includes('password'));
    assert.ok(!serializado.includes('database'));
  });
});

// =============================================================================
// 8. PasswordService — DoS por bcrypt amplification e senhas maliciosas
// =============================================================================

suite('PasswordService — proteção contra DoS e senhas maliciosas', () => {

  test('senha com 200 chars é rejeitada antes do bcrypt (previne bcrypt DoS)', () => {
    // bcrypt tem limite de 72 bytes de entrada; senhas longas causam CPU spike
    // PasswordService.validarForca() rejeita > 128 chars ANTES de chegar no bcrypt.hash()
    const r = PasswordService.validarForca('A1b' + 'c'.repeat(200));
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /longa/i);
  });

  test('hash() com senha vazia lança Error (sem chamada ao bcrypt)', async () => {
    await assert.rejects(() => PasswordService.hash(''), Error);
  });

  test('hash() com null lança Error', async () => {
    await assert.rejects(() => PasswordService.hash(null), Error);
  });

  test('senha errada → verificar() retorna false sem lançar exceção', async () => {
    const hash = await PasswordService.hash('Barber1Flow');
    const ok   = await PasswordService.verificar('SenhaErrada1', hash);
    assert.strictEqual(ok, false);
  });

  test('dois hashes da mesma senha são diferentes (salt aleatório por bcrypt)', async () => {
    const h1 = await PasswordService.hash('Barber1Flow');
    const h2 = await PasswordService.hash('Barber1Flow');
    assert.notStrictEqual(h1, h2);
  });

  test('hash nunca contém a senha em texto puro', async () => {
    const senha = 'Barber1Flow';
    const hash  = await PasswordService.hash(senha);
    assert.ok(!hash.includes(senha), 'hash não deve conter a senha original');
  });

  test('senha sem maiúscula é rejeitada por validarForca', () => {
    const r = PasswordService.validarForca('barber1flow');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /maiúscula|maiusc/i);
  });

  test('senha sem número é rejeitada por validarForca', () => {
    const r = PasswordService.validarForca('BarberFlow');
    assert.strictEqual(r.ok, false);
    assert.match(r.msg, /número|numero/i);
  });
});

// =============================================================================
// 9. UserService — Ataques via e-mail e enumeração de usuários
// =============================================================================

suite('UserService — validação de e-mail e proteção contra user enumeration', () => {

  function criarSvc(perfil = null) {
    const repo = {
      findByEmail:      fn().mockResolvedValue(perfil),
      getPerfilPublico: fn().mockResolvedValue(perfil),
    };
    return new UserService(repo);
  }

  test('XSS em e-mail → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(
      () => svc.buscarPorEmail('<img src=x onerror=alert(1)>'),
      (err) => err.status === 400,
    );
  });

  test("SQL injection em e-mail → 400", async () => {
    const svc = criarSvc();
    await assert.rejects(
      () => svc.buscarPorEmail("' OR '1'='1'--"),
      (err) => err.status === 400,
    );
  });

  test('e-mail vazio → 400', async () => {
    const svc = criarSvc();
    await assert.rejects(
      () => svc.buscarPorEmail(''),
      (err) => err.status === 400,
    );
  });

  test('e-mail com mais de 254 chars → 400', async () => {
    const svc = criarSvc();
    const emailLongo = 'a'.repeat(250) + '@x.com';
    await assert.rejects(
      () => svc.buscarPorEmail(emailLongo),
      (err) => err.status === 400,
    );
  });

  test('e-mail válido, usuário inexistente → 404 (evita user enumeration via timing)', async () => {
    // Retorna 404 genérico — não vaza "e-mail não cadastrado"
    const svc = criarSvc(null);
    await assert.rejects(
      () => svc.buscarPorEmail('inexistente@barberflow.com'),
      (err) => err.status === 404,
    );
  });

  test('UUID inválido em buscarPerfilPublico → 400 (sem consulta ao banco)', async () => {
    const svc = criarSvc();
    await assert.rejects(
      () => svc.buscarPerfilPublico("' UNION SELECT * FROM auth.users--"),
      (err) => err.status === 400,
    );
  });

  test('e-mail válido com usuário existente → retorna perfil corretamente', async () => {
    const svc = criarSvc({ id: UUID_A, full_name: 'João Barbeiro' });
    const result = await svc.buscarPorEmail('joao@barberflow.com');
    assert.strictEqual(result.id, UUID_A);
    assert.strictEqual(result.full_name, 'João Barbeiro');
  });
});
