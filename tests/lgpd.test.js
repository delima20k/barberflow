'use strict';

/**
 * tests/lgpd.test.js
 *
 * Testes para LgpdService — conformidade com a LGPD (Lei 13.709/2018).
 * Cobre: exportarDados(), solicitarExclusao(), exclusaoPendente(),
 *        cancelarExclusao(), registrarConsentimentoCliente(),
 *        verificarConsentimentoCliente(), registrarAcesso()
 *
 * Runner: Jest — npm test
 *
 * Estratégia de isolamento:
 *   Cada teste cria um sandbox VM com SupabaseService e LoggerService mockados.
 *   sessionStorage é stubado para testar o cache de consentimento.
 *   Todos os mocks são recriados por teste — zero estado compartilhado.
 */

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT    = path.resolve(__dirname, '..');
const USER_ID = 'test-user-uuid-4321';

function carregar(sandbox, relPath) {
  const raw   = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const nomes = [...raw.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${raw}\n${exp}`, sandbox);
}

/**
 * Cria um query builder mockado que suporta os padrões usados pelo LgpdService:
 *   select().eq().{single|maybeSingle}()
 *   upsert()
 *   insert()
 *   update().eq()
 *
 * Todas as chamadas terminais resolvem para `result`.
 */
function criarQueryBuilder(result = { data: null, error: null }) {
  const updateChain   = { eq: jest.fn().mockResolvedValue(result) };
  const selectEqChain = {
    single:      jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  const selectChain = { eq: jest.fn().mockReturnValue(selectEqChain) };

  return {
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockResolvedValue(result),
    upsert: jest.fn().mockResolvedValue(result),
    update: jest.fn().mockReturnValue(updateChain),
    // Expõe chains para assertivas internas
    _select:   selectChain,
    _selectEq: selectEqChain,
    _update:   updateChain,
  };
}

/**
 * Fábrica principal de testes.
 * Cria sandbox VM isolado com LgpdService carregado e mocks configuráveis.
 *
 * @param {{ deletionResult, profileResult, consentResult, accessLogResult, sessionStoragePreload }}
 */
function criarLgpdService({
  deletionResult       = { data: null, error: null },
  profileResult        = { data: null, error: null },
  consentResult        = { data: null, error: null },
  accessLogResult      = { data: null, error: null },
  sessionStoragePreload = {},
} = {}) {
  const deletionBuilder  = criarQueryBuilder(deletionResult);
  const profileBuilder   = criarQueryBuilder(profileResult);
  const consentBuilder   = criarQueryBuilder(consentResult);
  const accessLogBuilder = criarQueryBuilder(accessLogResult);

  const supabaseMock = {
    deletionRequests: jest.fn(() => deletionBuilder),
    profiles:         jest.fn(() => profileBuilder),
    legalConsents:    jest.fn(() => consentBuilder),
    dataAccessLog:    jest.fn(() => accessLogBuilder),
  };

  const loggerMock = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };

  // sessionStorage stub com pré-carga — simula o cache entre chamadas
  const store = { ...sessionStoragePreload };
  const sessionStorageMock = {
    getItem:    jest.fn(k => store[k] ?? null),
    setItem:    jest.fn((k, v) => { store[k] = v; }),
    removeItem: jest.fn(k => { delete store[k]; }),
  };

  const sandbox = vm.createContext({
    console,
    SupabaseService:  supabaseMock,
    LoggerService:    loggerMock,
    sessionStorage:   sessionStorageMock,
  });

  carregar(sandbox, 'shared/js/LgpdService.js');

  return {
    LgpdService:     sandbox.LgpdService,
    supabaseMock,
    loggerMock,
    sessionStorage:  sessionStorageMock,
    deletionBuilder,
    profileBuilder,
    consentBuilder,
    accessLogBuilder,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — exportarDados()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — exportarDados()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    const result = await LgpdService.exportarDados('');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/userId/);
  });

  test('Supabase ok → retorna perfil + consentimento + exportadoEm', async () => {
    const perfilData  = { id: USER_ID, full_name: 'João', phone: '11999' };
    const consentData = { plan_type: 'client', aceitou_termos: true, version: 1 };
    const { LgpdService } = criarLgpdService({
      profileResult: { data: perfilData,  error: null },
      consentResult: { data: consentData, error: null },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    expect(result.ok).toBe(true);
    expect(result.dados.perfil).toEqual(perfilData);
    expect(result.dados.consentimento).toEqual(consentData);
    expect(typeof result.dados.exportadoEm).toBe('string');
  });

  test('Consentimento inexistente → ok:true, consentimento:null', async () => {
    const { LgpdService } = criarLgpdService({
      profileResult: { data: { id: USER_ID }, error: null },
      consentResult: { data: null, error: null },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    expect(result.ok).toBe(true);
    expect(result.dados.consentimento).toBeNull();
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      profileResult: { data: null, error: { message: 'connection refused' } },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('Chama registrarAcesso com recurso "profiles" e acao "export"', async () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService({
      profileResult: { data: { id: USER_ID }, error: null },
      consentResult: { data: null, error: null },
    });

    await LgpdService.exportarDados(USER_ID);
    await Promise.resolve(); // flush fire-and-forget

    expect(accessLogBuilder.insert).toHaveBeenCalledTimes(1);
    expect(accessLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, recurso: 'profiles', acao: 'export' })
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — solicitarExclusao()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — solicitarExclusao()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    expect((await LgpdService.solicitarExclusao('')).ok).toBe(false);
  });

  test('Upsert ok → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    expect((await LgpdService.solicitarExclusao(USER_ID)).ok).toBe(true);
  });

  test('Chama upsert com status "pending", motivo correto e onConflict por user_id', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.solicitarExclusao(USER_ID, 'consent_withdrawn');

    expect(deletionBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, status: 'pending', motivo: 'consent_withdrawn' }),
      expect.objectContaining({ onConflict: 'user_id' })
    );
  });

  test('Motivo padrão é "user_request"', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.solicitarExclusao(USER_ID);

    expect(deletionBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'user_request' }),
      expect.any(Object)
    );
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'unique violation' } },
    });

    const result = await LgpdService.solicitarExclusao(USER_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — exclusaoPendente()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — exclusaoPendente()', () => {

  test('userId vazio → false', async () => {
    const { LgpdService } = criarLgpdService();
    expect(await LgpdService.exclusaoPendente('')).toBe(false);
  });

  test('Sem registro no banco → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    expect(await LgpdService.exclusaoPendente(USER_ID)).toBe(false);
  });

  test('status "pending" → true', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'pending' }, error: null },
    });
    expect(await LgpdService.exclusaoPendente(USER_ID)).toBe(true);
  });

  test('status "completed" → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'completed' }, error: null },
    });
    expect(await LgpdService.exclusaoPendente(USER_ID)).toBe(false);
  });

  test('status "cancelled" → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'cancelled' }, error: null },
    });
    expect(await LgpdService.exclusaoPendente(USER_ID)).toBe(false);
  });

  test('Erro de rede → false (fail open, não derruba o app)', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'network timeout' } },
    });
    expect(await LgpdService.exclusaoPendente(USER_ID)).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — cancelarExclusao()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — cancelarExclusao()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    expect((await LgpdService.cancelarExclusao('')).ok).toBe(false);
  });

  test('Sucesso → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { error: null },
    });
    expect((await LgpdService.cancelarExclusao(USER_ID)).ok).toBe(true);
  });

  test('Chama update({ status: "cancelled" }) filtrado por user_id', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.cancelarExclusao(USER_ID);

    expect(deletionBuilder.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(deletionBuilder._update.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'row not found' } },
    });
    const result = await LgpdService.cancelarExclusao(USER_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 5 — registrarConsentimentoCliente()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — registrarConsentimentoCliente()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    expect((await LgpdService.registrarConsentimentoCliente('')).ok).toBe(false);
  });

  test('Upsert ok → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { error: null },
    });
    expect((await LgpdService.registrarConsentimentoCliente(USER_ID)).ok).toBe(true);
  });

  test('Após sucesso, grava flag de consentimento no sessionStorage', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { error: null },
    });

    await LgpdService.registrarConsentimentoCliente(USER_ID);

    expect(ss.setItem).toHaveBeenCalledWith('bf_client_consent', '1');
  });

  test('Chama upsert com plan_type "client" e aceitou_termos=true', async () => {
    const { LgpdService, consentBuilder } = criarLgpdService({
      consentResult: { error: null },
    });

    await LgpdService.registrarConsentimentoCliente(USER_ID);

    expect(consentBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:        USER_ID,
        plan_type:      'client',
        aceitou_termos: true,
      }),
      expect.objectContaining({ onConflict: 'user_id' })
    );
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'constraint violation' } },
    });
    const result = await LgpdService.registrarConsentimentoCliente(USER_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 6 — verificarConsentimentoCliente()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — verificarConsentimentoCliente()', () => {

  test('userId vazio → false', async () => {
    const { LgpdService } = criarLgpdService();
    expect(await LgpdService.verificarConsentimentoCliente('')).toBe(false);
  });

  test('Cache sessionStorage ativo → true sem consultar Supabase', async () => {
    const { LgpdService, supabaseMock } = criarLgpdService({
      sessionStoragePreload: { bf_client_consent: '1' },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    expect(result).toBe(true);
    expect(supabaseMock.legalConsents).not.toHaveBeenCalled();
  });

  test('aceitou_termos=true → retorna true e salva flag no cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: true }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    expect(result).toBe(true);
    expect(ss.setItem).toHaveBeenCalledWith('bf_client_consent', '1');
  });

  test('aceitou_termos=false → retorna false, não grava cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: false }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    expect(result).toBe(false);
    expect(ss.setItem).not.toHaveBeenCalled();
  });

  test('Sem registro → false', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: null },
    });
    expect(await LgpdService.verificarConsentimentoCliente(USER_ID)).toBe(false);
  });

  test('Erro de rede → false (fail open)', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'timeout' } },
    });
    expect(await LgpdService.verificarConsentimentoCliente(USER_ID)).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 7 — registrarAcesso()
// ─────────────────────────────────────────────────────────────────────────────

describe('LgpdService — registrarAcesso()', () => {

  test('Parâmetros inválidos → insert não é chamado', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso('',      'profiles', 'read');
    LgpdService.registrarAcesso(USER_ID, '',         'read');
    LgpdService.registrarAcesso(USER_ID, 'profiles', '');

    expect(accessLogBuilder.insert).not.toHaveBeenCalled();
  });

  test('Parâmetros válidos → insert chamado com user_id, recurso e acao', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso(USER_ID, 'appointments', 'read');

    expect(accessLogBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        recurso: 'appointments',
        acao:    'read',
      })
    );
  });

  test('Erro no insert é silenciado — não lança exceção', async () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();
    accessLogBuilder.insert.mockRejectedValue(new Error('permission denied'));

    expect(() => LgpdService.registrarAcesso(USER_ID, 'profiles', 'write')).not.toThrow();
    await Promise.resolve(); // flush microtask do .catch()
  });

  test('É fire-and-forget — método retorna void imediatamente', () => {
    const { LgpdService } = criarLgpdService();
    const retorno = LgpdService.registrarAcesso(USER_ID, 'profiles', 'read');
    // Não deve ser uma Promise
    expect(retorno).toBeUndefined();
  });

});
