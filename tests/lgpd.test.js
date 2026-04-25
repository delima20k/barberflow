'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

/**
 * Verifica que `actual` contÃ©m TODAS as propriedades de `partial`.
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
 * Cria um query builder mockado que suporta os padrÃµes usados pelo LgpdService:
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
    // ExpÃµe chains para assertivas internas
    _select:   selectChain,
    _selectEq: selectEqChain,
    _update:   updateChain,
  };
}

/**
 * FÃ¡brica principal de testes.
 * Cria sandbox VM isolado com LgpdService carregado e mocks configurÃ¡veis.
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

  // sessionStorage stub com prÃ©-carga â€” simula o cache entre chamadas
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 1 â€” exportarDados()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” exportarDados()', () => {

  test('userId vazio â†’ { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    const result = await LgpdService.exportarDados('');
    assert.strictEqual(result.ok, false);
    assert.match(String(result.error), /userId/);
  });

  test('Supabase ok â†’ retorna perfil + consentimento + exportadoEm', async () => {
    const perfilData  = { id: USER_ID, full_name: 'JoÃ£o', phone: '11999' };
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

  test('Consentimento inexistente â†’ ok:true, consentimento:null', async () => {
    const { LgpdService } = criarLgpdService({
      profileResult: { data: { id: USER_ID }, error: null },
      consentResult: { data: null, error: null },
    });

    const result = await LgpdService.exportarDados(USER_ID);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.dados.consentimento, null);
  });

  test('Erro no Supabase â†’ { ok: false, error }', async () => {
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 2 â€” solicitarExclusao()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” solicitarExclusao()', () => {

  test('userId vazio â†’ { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.solicitarExclusao('')).ok, false);
  });

  test('Upsert ok â†’ { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    assert.strictEqual((await LgpdService.solicitarExclusao(USER_ID)).ok, true);
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

  test('Motivo padrÃ£o Ã© "user_request"', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.solicitarExclusao(USER_ID);

    assertContains(deletionBuilder.upsert.calls[0][0], { motivo: 'user_request' });
  });

  test('Erro no Supabase â†’ { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'unique violation' } },
    });

    const result = await LgpdService.solicitarExclusao(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 3 â€” exclusaoPendente()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” exclusaoPendente()', () => {

  test('userId vazio â†’ false', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual(await LgpdService.exclusaoPendente(''), false);
  });

  test('Sem registro no banco â†’ false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID), false);
  });

  test('status "pending" â†’ true', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'pending' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID), true);
  });

  test('status "completed" â†’ false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'completed' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID), false);
  });

  test('status "cancelled" â†’ false', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: { status: 'cancelled' }, error: null },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID), false);
  });

  test('Erro de rede â†’ false (fail open, nÃ£o derruba o app)', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'network timeout' } },
    });
    assert.strictEqual(await LgpdService.exclusaoPendente(USER_ID), false);
  });

});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 4 â€” cancelarExclusao()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” cancelarExclusao()', () => {

  test('userId vazio â†’ { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.cancelarExclusao('')).ok, false);
  });

  test('Sucesso â†’ { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { error: null },
    });
    assert.strictEqual((await LgpdService.cancelarExclusao(USER_ID)).ok, true);
  });

  test('Chama update({ status: "cancelled" }) filtrado por user_id', async () => {
    const { LgpdService, deletionBuilder } = criarLgpdService({
      deletionResult: { error: null },
    });

    await LgpdService.cancelarExclusao(USER_ID);

    const updateArgs = deletionBuilder.update.calls[deletionBuilder.update.calls.length-1];
    assertContains(updateArgs[0], { status: 'cancelled' });
    const eqArgs = deletionBuilder._update.eq.calls[deletionBuilder._update.eq.calls.length-1];
    assert.strictEqual(eqArgs[0], 'user_id');
    assert.strictEqual(eqArgs[1], USER_ID);
  });

  test('Erro no Supabase â†’ { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      deletionResult: { data: null, error: { message: 'row not found' } },
    });
    const result = await LgpdService.cancelarExclusao(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 5 â€” registrarConsentimentoCliente()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” registrarConsentimentoCliente()', () => {

  test('userId vazio â†’ { ok: false }', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual((await LgpdService.registrarConsentimentoCliente('')).ok, false);
  });

  test('Upsert ok â†’ { ok: true }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { error: null },
    });
    assert.strictEqual((await LgpdService.registrarConsentimentoCliente(USER_ID)).ok, true);
  });

  test('ApÃ³s sucesso, grava flag de consentimento no sessionStorage', async () => {
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

  test('Erro no Supabase â†’ { ok: false, error }', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'constraint violation' } },
    });
    const result = await LgpdService.registrarConsentimentoCliente(USER_ID);
    assert.strictEqual(result.ok, false);
    assert.notStrictEqual(result.error, undefined);
  });

});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 6 â€” verificarConsentimentoCliente()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” verificarConsentimentoCliente()', () => {

  test('userId vazio â†’ false', async () => {
    const { LgpdService } = criarLgpdService();
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente(''), false);
  });

  test('Cache sessionStorage ativo â†’ true sem consultar Supabase', async () => {
    const { LgpdService, supabaseMock } = criarLgpdService({
      sessionStoragePreload: { bf_client_consent: '1' },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, true);
    assert.strictEqual(supabaseMock.legalConsents.calls.length, 0);
  });

  test('aceitou_termos=true â†’ retorna true e salva flag no cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: true }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, true);
    assert.deepStrictEqual(ss.setItem.calls[ss.setItem.calls.length-1], ['bf_client_consent', '1']);
  });

  test('aceitou_termos=false â†’ retorna false, nÃ£o grava cache', async () => {
    const { LgpdService, sessionStorage: ss } = criarLgpdService({
      consentResult: { data: { aceitou_termos: false }, error: null },
    });

    const result = await LgpdService.verificarConsentimentoCliente(USER_ID);

    assert.strictEqual(result, false);
    assert.strictEqual(ss.setItem.calls.length, 0);
  });

  test('Sem registro â†’ false', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: null },
    });
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente(USER_ID), false);
  });

  test('Erro de rede â†’ false (fail open)', async () => {
    const { LgpdService } = criarLgpdService({
      consentResult: { data: null, error: { message: 'timeout' } },
    });
    assert.strictEqual(await LgpdService.verificarConsentimentoCliente(USER_ID), false);
  });

});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BLOCO 7 â€” registrarAcesso()
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

suite('LgpdService â€” registrarAcesso()', () => {

  test('ParÃ¢metros invÃ¡lidos â†’ insert nÃ£o Ã© chamado', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso('',      'profiles', 'read');
    LgpdService.registrarAcesso(USER_ID, '',         'read');
    LgpdService.registrarAcesso(USER_ID, 'profiles', '');

    assert.strictEqual(accessLogBuilder.insert.calls.length, 0);
  });

  test('ParÃ¢metros vÃ¡lidos â†’ insert chamado com user_id, recurso e acao', () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();

    LgpdService.registrarAcesso(USER_ID, 'appointments', 'read');

    assertContains(accessLogBuilder.insert.calls[0][0], { user_id: USER_ID, recurso: 'appointments', acao: 'read' });
  });

  test('Erro no insert Ã© silenciado â€” nÃ£o lanÃ§a exceÃ§Ã£o', async () => {
    const { LgpdService, accessLogBuilder } = criarLgpdService();
    accessLogBuilder.insert.mockRejectedValue(new Error('permission denied'));

    assert.doesNotThrow(() => LgpdService.registrarAcesso(USER_ID, 'profiles', 'write'));
    await Promise.resolve(); // flush microtask do .catch()
  });

  test('Ã‰ fire-and-forget â€” mÃ©todo retorna void imediatamente', () => {
    const { LgpdService } = criarLgpdService();
    const retorno = LgpdService.registrarAcesso(USER_ID, 'profiles', 'read');
    // NÃ£o deve ser uma Promise
    assert.strictEqual(retorno, undefined);
  });

});
