'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

/**
 * Verifica que `actual` contém TODAS as propriedades de `partial`.
 * Equivalente ao expect.objectContaining() do Jest.
 */
function assertContains(actual, partial, msg = '') {
  for (const [k, v] of Object.entries(partial)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      assertContains(actual[k], v, `${msg}.${k}`);
    } else {
      assert.strictEqual(actual[k], v, `${msg}.${k}: expected ${v}, got ${actual[k]}`);
    }
  }
}


const USER_ID = 'test-user-uuid-4321';

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
  const updateChain   = { eq: fn().mockResolvedValue(result) };
  const selectEqChain = {
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const selectChain = { eq: fn().mockReturnValue(selectEqChain) };

  return {
    select: fn().mockReturnValue(selectChain),
    insert: fn().mockResolvedValue(result),
    upsert: fn().mockResolvedValue(result),
    update: fn().mockReturnValue(updateChain),
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
    deletionRequests: fn(() => deletionBuilder),
    profiles:         fn(() => profileBuilder),
    legalConsents:    fn(() => consentBuilder),
    dataAccessLog:    fn(() => accessLogBuilder),
  };

  const loggerMock = { warn: fn(), error: fn(), info: fn() };

  // sessionStorage stub com pré-carga — simula o cache entre chamadas
  const store = { ...sessionStoragePreload };
  const sessionStorageMock = {
    getItem:    fn(k => store[k] ?? null),
    setItem:    fn((k, v) => { store[k] = v; }),
    removeItem: fn(k => { delete store[k]; }),
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

suite('LgpdService — exportarDados()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    const result = await LgpdService.exportarDados('');
    assert.strictEqual(result.ok, false);
    assert.match(String(result.error), /userId/);
  });

  test('Supabase ok → retorna perfil + consentimento + exportadoEm', async () => {
    const perfilData  = { id: USER_ID, full_name: 'João', phone: '11999' };
    const consentData = { plan_type: 'client', aceitou_termos: true, version: 1 };
    const { LgpdService } = criarLgpdService({
      profileResult: { data: perfilData,  error: null },
      consentResult: { data: consentData, error: null },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.dados.perfil, perfilData);
    assert.deepStrictEqual(result.dados.consentimento, consentData);
    assert.strictEqual(typeof result.dados.exportadoEm, 'string');
  });

  test('Consentimento inexistente → ok:true, consentimento:null', async () => {
    const { LgpdService } = criarLgpdService({
      profileResult: { data: { id: USER_ID }, error: null },
      consentResult: { data: null, error: null },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.dados.consentimento, null);
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      profileResult: { data: null, error: { message: 'connection refused' } },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

  test('Chama registrarAcesso com recurso "profiles" e acao "export"', async () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService({
      profileResult: { data: { id: USER_ID }, error: null },
      consentResult: { data: null, error: null },
    });

    await LgpdService.exportarDados(USER_ID);
    await Promise.resolve(); // flush fire-and-forget

    assert.strictEqual(accessLogBuilder.insert.calls.length, 1);
    assertContains(accessLogBuilder.insert.calls[0][0], { user_id: USER_ID, recurso: 'profiles', acao: 'export' });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — solicitarExclusao()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — solicitarExclusao()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.solicitarExclusao('')).ok), false);
  });

  test('Upsert ok → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    assert.strictEqual((await LgpdService.solicitarExclusao(USER_ID)).ok), true);
  });

  test('Chama upsert com status "pending", motivo correto e onConflict por user_id', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.solicitarExclusao(USER_ID, 'consent_withdrawn');

    const upsertArgs = deletionBuilder.upsert.calls[0];
    assertContains(upsertArgs[0], { user_id: USER_ID, status: 'pending', motivo: 'consent_withdrawn' });
    assertContains(upsertArgs[1], { onConflict: 'user_id' });
  });

  test('Motivo padrão é "user_request"', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.solicitarExclusao(USER_ID);

    assertContains(deletionBuilder.upsert.calls[0][0], { motivo: 'user_request' });
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'unique violation' } },
    });

    const result = await LgpdService.solicitarExclusao(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — exclusaoPendente()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — exclusaoPendente()', () => {

  test('userId vazio → false', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual(await LgpdService.exclusaoPendente('')), false);
  });

  test('Sem registro no banco → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID)), false);
  });

  test('status "pending" → true', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'pending' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID)), true);
  });

  test('status "completed" → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'completed' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID)), false);
  });

  test('status "cancelled" → false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'cancelled' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID)), false);
  });

  test('Erro de rede → false (fail open, não derruba o app)', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'network timeout' } },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID)), false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — cancelarExclusao()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — cancelarExclusao()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.cancelarExclusao('')).ok), false);
  });

  test('Sucesso → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { error: null },
    });
    assert.strictEqual((await LgpdService.cancelarExclusao(USER_ID)).ok), true);
  });

  test('Chama update({ status: "cancelled" }) filtrado por user_id', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.cancelarExclusao(USER_ID);

    assert.deepStrictEqual(deletionBuilder.update.calls[deletionBuilder.update.calls.length-1], [{ status: 'cancelled' }]);
    assert.deepStrictEqual(deletionBuilder._update.eq.calls[deletionBuilder._update.eq.calls.length-1], ['user_id', USER_ID]);
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'row not found' } },
    });
    const result = await LgpdService.cancelarExclusao(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 5 — registrarConsentimentoCliente()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — registrarConsentimentoCliente()', () => {

  test('userId vazio → { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.registrarConsentimentoCliente('')).ok), false);
  });

  test('Upsert ok → { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { error: null },
    });
    assert.strictEqual((await LgpdService.registrarConsentimentoCliente(USER_ID)).ok), true);
  });

  test('Após sucesso, grava flag de consentimento no sessionStorage', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { error: null },
    });

    await LgpdService.registrarConsentimentoCliente(USER_ID);

    assert.deepStrictEqual(ss.setItem.calls[ss.setItem.calls.length-1], ['bf_client_consent', '1']);
  });

  test('Chama upsert com plan_type "client" e aceitou_termos=true', async () => {
    const { LgpdService, consentBuilder } = criarLgpdService({
      consentResult: { error: null },
    });

    await LgpdService.registrarConsentimentoCliente(USER_ID);

    const upsertArgs = consentBuilder.upsert.calls[0];
    assertContains(upsertArgs[0], { user_id: USER_ID, plan_type: 'client', aceitou_termos: true });
    assertContains(upsertArgs[1], { onConflict: 'user_id' });
  });

  test('Erro no Supabase → { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'constraint violation' } },
    });
    const result = await LgpdService.registrarConsentimentoCliente(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 6 — verificarConsentimentoCliente()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — verificarConsentimentoCliente()', () => {

  test('userId vazio → false', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente('')), false);
  });

  test('Cache sessionStorage ativo → true sem consultar Supabase', async () => {
    const { LgpdService, supabaseMock } = criarLgpdService({
      sessionStoragePreload: { bf_client_consent: '1' },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, true);
    assert.strictEqual(supabaseMock.legalConsents.calls.length, 0);
  });

  test('aceitou_termos=true → retorna true e salva flag no cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: true }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, true);
    assert.deepStrictEqual(ss.setItem.calls[ss.setItem.calls.length-1], ['bf_client_consent', '1']);
  });

  test('aceitou_termos=false → retorna false, não grava cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: false }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, false);
    assert.strictEqual(ss.setItem.calls.length, 0);
  });

  test('Sem registro → false', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: null },
    });
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente(USER_ID)), false);
  });

  test('Erro de rede → false (fail open)', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'timeout' } },
    });
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente(USER_ID)), false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 7 — registrarAcesso()
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdService — registrarAcesso()', () => {

  test('Parâmetros inválidos → insert não é chamado', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso('',      'profiles', 'read');
    LgpdService.registrarAcesso(USER_ID, '',         'read');
    LgpdService.registrarAcesso(USER_ID, 'profiles', '');

    assert.strictEqual(accessLogBuilder.insert.calls.length, 0);
  });

  test('Parâmetros válidos → insert chamado com user_id, recurso e acao', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso(USER_ID, 'appointments', 'read');

    assertContains(accessLogBuilder.insert.calls[0][0], { user_id: USER_ID, recurso: 'appointments', acao: 'read' });
  });

  test('Erro no insert é silenciado — não lança exceção', async () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();
    accessLogBuilder.insert.mockRejectedValue(new Error('permission denied'));

    assert.doesNotThrow(() => LgpdService.registrarAcesso(USER_ID, 'profiles', 'write'));
    await Promise.resolve(); // flush microtask do .catch()
  });

  test('É fire-and-forget — método retorna void imediatamente', () => {
    const { LgpdService } = criarLgpdService();
    const retorno = LgpdService.registrarAcesso(USER_ID, 'profiles', 'read');
    // Não deve ser uma Promise
    assert.strictEqual(retorno, undefined);
  });

});
