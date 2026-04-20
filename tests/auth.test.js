'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

/** Fábrica: contexto limpo com AppState carregado. */
function novoAppState() {
  const s = criarCtx();
  carregar(s, 'shared/js/AppState.js');
  return { AppState: s.AppState };
}

/** Fábrica: contexto limpo com AppState + AuthGuard carregados. */
function novoGuard({ simularPro = false } = {}) {
  const s = criarCtx({ simularPro });
  carregar(s, 'shared/js/AppState.js');
  carregar(s, 'shared/js/AuthGuard.js');
  return { AppState: s.AppState, AuthGuard: s.AuthGuard };
}

/**
 * Mock de instância de Router — rastreia chamadas a push().
 * @returns {{ push: function, _calls: string[] }}
 */
function mockRouter() {
  const calls = [];
  return { push: (tela) => calls.push(tela), _calls: calls };
}

// Dados de exemplo reutilizáveis
const USER_CLIENTE     = { id: 'u-cliente-01',  email: 'joao@barberflow.com' };
const PERFIL_CLIENTE   = { id: 'u-cliente-01',  full_name: 'João Silva',   role: 'client'       };
const USER_PRO         = { id: 'u-pro-01',      email: 'maria@barberflow.com' };
const PERFIL_PRO       = { id: 'u-pro-01',      full_name: 'Maria Barbeira', role: 'professional' };

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — AppState: Estado inicial
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — estado inicial', () => {

  test('isLogado=false, user=null, perfil=null, geo=null', () => {
    const { AppState } = novoAppState();
    assert.strictEqual(AppState.get('isLogado'), false);
    assert.strictEqual(AppState.get('user'),     null);
    assert.strictEqual(AppState.get('perfil'),   null);
    assert.strictEqual(AppState.get('geo'),      null);
  });

  test('isLogged() retorna false', () => {
    const { AppState } = novoAppState();
    assert.strictEqual(AppState.isLogged(), false);
  });

  test('getUserId() retorna null', () => {
    const { AppState } = novoAppState();
    assert.strictEqual(AppState.getUserId(), null);
  });

  test('getRole() retorna null', () => {
    const { AppState } = novoAppState();
    assert.strictEqual(AppState.getRole(), null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — AppState: login()
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — login()', () => {

  test('atualiza isLogado=true, user e perfil atomicamente', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AppState.get('isLogado'), true);
    assert.deepStrictEqual(AppState.get('user'),   USER_CLIENTE);
    assert.deepStrictEqual(AppState.get('perfil'), PERFIL_CLIENTE);
  });

  test('isLogged() retorna true após login()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AppState.isLogged(), true);
  });

  test('getUserId() retorna o id correto após login()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AppState.getUserId(), 'u-cliente-01');
  });

  test('getRole() retorna o role do perfil', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_PRO, PERFIL_PRO);
    assert.strictEqual(AppState.getRole(), 'professional');
  });

  test('getUser() retorna o objeto user completo', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.deepStrictEqual(AppState.getUser(), USER_CLIENTE);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — AppState: logout() / clear()
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — logout()', () => {

  test('reseta isLogado, user, perfil e geo após login', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    AppState.setGeo({ lat: -23.5, lng: -46.6 });
    AppState.logout();
    assert.strictEqual(AppState.get('isLogado'), false);
    assert.strictEqual(AppState.get('user'),     null);
    assert.strictEqual(AppState.get('perfil'),   null);
    assert.strictEqual(AppState.get('geo'),      null);
  });

  test('isLogged() retorna false após logout()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    AppState.logout();
    assert.strictEqual(AppState.isLogged(), false);
  });

  test('getUserId() retorna null após logout()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    AppState.logout();
    assert.strictEqual(AppState.getUserId(), null);
  });

  test('getRole() retorna null após logout()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_PRO, PERFIL_PRO);
    AppState.logout();
    assert.strictEqual(AppState.getRole(), null);
  });

  test('clear() é equivalente a logout()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    AppState.clear();
    assert.strictEqual(AppState.isLogged(), false);
    assert.strictEqual(AppState.getUserId(), null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — AppState: setters semânticos
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — setters semânticos', () => {

  test('setAuth(true) → isLogado=true', () => {
    const { AppState } = novoAppState();
    AppState.setAuth(true);
    assert.strictEqual(AppState.get('isLogado'), true);
  });

  test('setAuth(false) → isLogado=false', () => {
    const { AppState } = novoAppState();
    AppState.setAuth(true);
    AppState.setAuth(false);
    assert.strictEqual(AppState.get('isLogado'), false);
  });

  test('setUser() → user atualizado', () => {
    const { AppState } = novoAppState();
    AppState.setUser(USER_CLIENTE);
    assert.deepStrictEqual(AppState.get('user'), USER_CLIENTE);
  });

  test('setUser(null) → user=null', () => {
    const { AppState } = novoAppState();
    AppState.setUser(USER_CLIENTE);
    AppState.setUser(null);
    assert.strictEqual(AppState.get('user'), null);
  });

  test('setPerfil() → perfil atualizado', () => {
    const { AppState } = novoAppState();
    AppState.setPerfil(PERFIL_CLIENTE);
    assert.deepStrictEqual(AppState.get('perfil'), PERFIL_CLIENTE);
  });

  test('setGeo() → geo atualizado', () => {
    const { AppState } = novoAppState();
    const geo = { lat: -23.5505, lng: -46.6333 };
    AppState.setGeo(geo);
    assert.deepStrictEqual(AppState.get('geo'), geo);
  });

  test('setGeo(null) → geo=null', () => {
    const { AppState } = novoAppState();
    AppState.setGeo({ lat: 0, lng: 0 });
    AppState.setGeo(null);
    assert.strictEqual(AppState.get('geo'), null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 5 — AppState: listeners e reatividade
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — listeners reativos', () => {

  test('onAuth() dispara com true ao fazer login()', () => {
    const { AppState } = novoAppState();
    let capturado;
    AppState.onAuth(v => { capturado = v; });
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(capturado, true);
  });

  test('onAuth() dispara com false ao fazer logout()', () => {
    const { AppState } = novoAppState();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    let capturado;
    AppState.onAuth(v => { capturado = v; });
    AppState.logout();
    assert.strictEqual(capturado, false);
  });

  test('on() → unsubscribe: callback não é chamado após off()', () => {
    const { AppState } = novoAppState();
    let chamadas = 0;
    const off = AppState.on('isLogado', () => chamadas++);
    AppState.setAuth(true);   // chamadas → 1
    off();
    AppState.setAuth(false);  // não deve incrementar
    assert.strictEqual(chamadas, 1);
  });

  test('onAny() recebe { key, value } em qualquer mudança de estado', () => {
    const { AppState } = novoAppState();
    const eventos = [];
    AppState.onAny(e => eventos.push({ key: e.key, value: e.value }));
    AppState.setAuth(true);
    AppState.setGeo({ lat: 0, lng: 0 });
    assert.strictEqual(eventos.length, 2);
    assert.strictEqual(eventos[0].key,   'isLogado');
    assert.strictEqual(eventos[0].value, true);
    assert.strictEqual(eventos[1].key,   'geo');
  });

  test('múltiplos listeners na mesma chave: todos são disparados', () => {
    const { AppState } = novoAppState();
    let a = 0, b = 0;
    AppState.onAuth(() => a++);
    AppState.onAuth(() => b++);
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  test('listener de chave específica não recebe mudanças de outra chave', () => {
    const { AppState } = novoAppState();
    let chamadas = 0;
    AppState.on('isLogado', () => chamadas++);
    AppState.setGeo({ lat: 0, lng: 0 }); // não deve disparar listener de isLogado
    assert.strictEqual(chamadas, 0);
  });

  test('onAuth() retorna função de unsubscribe funcional', () => {
    const { AppState } = novoAppState();
    let n = 0;
    const off = AppState.onAuth(() => n++);
    assert.strictEqual(typeof off, 'function');
    AppState.setAuth(true);  // n=1
    off();
    AppState.setAuth(false); // n permanece 1
    assert.strictEqual(n, 1);
  });

  test('onAny() retorna função de unsubscribe funcional', () => {
    const { AppState } = novoAppState();
    let n = 0;
    const off = AppState.onAny(() => n++);
    AppState.setAuth(true);  // n=1
    off();
    AppState.setAuth(false); // n permanece 1
    assert.strictEqual(n, 1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 6 — AppState: validação de schema
// ─────────────────────────────────────────────────────────────────────────────

suite('AppState — validação de schema', () => {

  test('chave inválida em get() lança TypeError', () => {
    const { AppState } = novoAppState();
    assert.throws(() => AppState.get('chaveInexistente'), { name: 'TypeError' });
  });

  test('chave inválida em set() lança TypeError', () => {
    const { AppState } = novoAppState();
    assert.throws(() => AppState.set('chaveInexistente', true), { name: 'TypeError' });
  });

  test('isLogado com valor não-boolean lança TypeError', () => {
    const { AppState } = novoAppState();
    assert.throws(() => AppState.set('isLogado', 'sim'), { name: 'TypeError' });
    assert.throws(() => AppState.set('isLogado', 1),     { name: 'TypeError' });
    assert.throws(() => AppState.set('isLogado', null),  { name: 'TypeError' });
  });

  test('user sem id (string) lança TypeError', () => {
    const { AppState } = novoAppState();
    assert.throws(() => AppState.setUser({ email: 'sem-id@x.com' }), { name: 'TypeError' });
    assert.throws(() => AppState.setUser({ id: 123 }),               { name: 'TypeError' });
  });

  test('geo sem lat/lng numérico lança TypeError', () => {
    const { AppState } = novoAppState();
    assert.throws(() => AppState.setGeo({ lat: 0 }),          { name: 'TypeError' }); // falta lng
    assert.throws(() => AppState.setGeo({ lng: 0 }),          { name: 'TypeError' }); // falta lat
    assert.throws(() => AppState.setGeo({ lat: '0', lng: 0 }), { name: 'TypeError' }); // lat string
  });

  test('valores válidos não lançam erro', () => {
    const { AppState } = novoAppState();
    assert.doesNotThrow(() => AppState.setAuth(true));
    assert.doesNotThrow(() => AppState.setAuth(false));
    assert.doesNotThrow(() => AppState.setUser(null));
    assert.doesNotThrow(() => AppState.setUser({ id: 'abc', email: 'x@y.com' }));
    assert.doesNotThrow(() => AppState.setPerfil(null));
    assert.doesNotThrow(() => AppState.setPerfil({ id: 'abc', role: 'client' }));
    assert.doesNotThrow(() => AppState.setGeo(null));
    assert.doesNotThrow(() => AppState.setGeo({ lat: -23.5, lng: -46.6 }));
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 7 — AuthGuard: rotas públicas (app cliente)
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthGuard — rotas públicas (app cliente)', () => {

  const PUBLICAS = ['inicio', 'pesquisa', 'barbearias', 'barbeiros', 'login', 'cadastro', 'destaques'];

  for (const tela of PUBLICAS) {
    test(`"${tela}" é acessível sem login`, () => {
      const { AuthGuard } = novoGuard();
      // AppState.isLogado = false (estado inicial — visitante)
      assert.strictEqual(AuthGuard.permitirNav(tela, mockRouter()), true);
    });
  }

  for (const tela of PUBLICAS) {
    test(`"${tela}" é acessível com login também`, () => {
      const { AuthGuard, AppState } = novoGuard();
      AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
      assert.strictEqual(AuthGuard.permitirNav(tela, mockRouter()), true);
    });
  }

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 8 — AuthGuard: rotas protegidas (app cliente)
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthGuard — rotas protegidas (app cliente)', () => {

  const PROTEGIDAS = ['perfil', 'mensagens', 'favoritas', 'agendamento', 'pagamento', 'sair'];

  for (const tela of PROTEGIDAS) {
    test(`"${tela}" bloqueia visitante e redireciona para login`, () => {
      const { AuthGuard } = novoGuard();
      const r = mockRouter();
      assert.strictEqual(AuthGuard.permitirNav(tela, r), false);
      assert.deepStrictEqual(r._calls, ['login']);
    });
  }

  for (const tela of PROTEGIDAS) {
    test(`"${tela}" é acessível para usuário logado`, () => {
      const { AuthGuard, AppState } = novoGuard();
      AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
      assert.strictEqual(AuthGuard.permitirNav(tela, mockRouter()), true);
    });
  }

  test('visitante bloqueado NÃO redireciona se não houver router', () => {
    const { AuthGuard } = novoGuard();
    // requireAuth(null) não deve lançar erro quando router é null
    assert.doesNotThrow(() => AuthGuard.permitirNav('perfil', null));
    assert.strictEqual(AuthGuard.permitirNav('perfil', null), false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 9 — AuthGuard: ações protegidas (app cliente)
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthGuard — ações protegidas (app cliente)', () => {

  const PROTEGIDAS = [
    'agendar',
    'mensagem',
    'pagar',
    'pagamento',
    'like',
    'barbershop-favorite',
    'avatar-upload',   // corrigida na sessão anterior
  ];

  const LIVRES = ['confirmar-saida', 'story-open', 'qualquer-outra-acao'];

  for (const acao of PROTEGIDAS) {
    test(`"${acao}" bloqueada para visitante — retorna false e redireciona`, () => {
      const { AuthGuard } = novoGuard();
      const r = mockRouter();
      assert.strictEqual(AuthGuard.permitirAcao(acao, r), false);
      assert.deepStrictEqual(r._calls, ['login']);
    });
  }

  for (const acao of LIVRES) {
    test(`"${acao}" NÃO é protegida — retorna true sem login`, () => {
      const { AuthGuard } = novoGuard();
      assert.strictEqual(AuthGuard.permitirAcao(acao, mockRouter()), true);
    });
  }

  for (const acao of PROTEGIDAS) {
    test(`"${acao}" permitida para usuário logado`, () => {
      const { AuthGuard, AppState } = novoGuard();
      AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
      assert.strictEqual(AuthGuard.permitirAcao(acao, mockRouter()), true);
    });
  }

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 10 — AuthGuard: requireAuth()
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthGuard — requireAuth()', () => {

  test('retorna false e chama router.push("login") quando não logado', () => {
    const { AuthGuard } = novoGuard();
    const r = mockRouter();
    assert.strictEqual(AuthGuard.requireAuth(r), false);
    assert.deepStrictEqual(r._calls, ['login']);
  });

  test('retorna true e NÃO chama push quando logado', () => {
    const { AuthGuard, AppState } = novoGuard();
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    const r = mockRouter();
    assert.strictEqual(AuthGuard.requireAuth(r), true);
    assert.deepStrictEqual(r._calls, []);
  });

  test('não lança erro quando router é null (visitante sem router)', () => {
    const { AuthGuard } = novoGuard();
    assert.doesNotThrow(() => AuthGuard.requireAuth(null));
    assert.strictEqual(AuthGuard.requireAuth(null), false);
  });

  test('não lança erro quando router não tem push (objeto inválido)', () => {
    const { AuthGuard } = novoGuard();
    assert.doesNotThrow(() => AuthGuard.requireAuth({}));
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 11 — AuthGuard: app profissional
// ─────────────────────────────────────────────────────────────────────────────

suite('AuthGuard — app profissional', () => {

  const PROTEGIDAS_PRO = ['minha-barbearia', 'agenda', 'perfil', 'mensagens', 'sair'];
  const PUBLICAS       = ['inicio', 'pesquisa', 'login', 'cadastro', 'destaques'];

  for (const tela of PROTEGIDAS_PRO) {
    test(`"${tela}" bloqueada para visitante no app profissional`, () => {
      const { AuthGuard } = novoGuard({ simularPro: true });
      const r = mockRouter();
      assert.strictEqual(AuthGuard.permitirNav(tela, r), false);
      assert.deepStrictEqual(r._calls, ['login']);
    });
  }

  for (const tela of PUBLICAS) {
    test(`"${tela}" é pública no app profissional`, () => {
      const { AuthGuard } = novoGuard({ simularPro: true });
      assert.strictEqual(AuthGuard.permitirNav(tela, mockRouter()), true);
    });
  }

  test('profissional logado acessa minha-barbearia', () => {
    const { AuthGuard, AppState } = novoGuard({ simularPro: true });
    AppState.login(USER_PRO, PERFIL_PRO);
    assert.strictEqual(AuthGuard.permitirNav('minha-barbearia', mockRouter()), true);
  });

  test('profissional logado acessa agenda', () => {
    const { AuthGuard, AppState } = novoGuard({ simularPro: true });
    AppState.login(USER_PRO, PERFIL_PRO);
    assert.strictEqual(AuthGuard.permitirNav('agenda', mockRouter()), true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 12 — Fluxo integrado: login → ações → logout
// ─────────────────────────────────────────────────────────────────────────────

suite('Fluxo integrado: login → ações → logout', () => {

  test('ciclo completo preserva e limpa o estado corretamente', () => {
    const { AppState, AuthGuard } = novoGuard();

    // 1. Estado inicial — visitante bloqueado
    assert.strictEqual(AppState.isLogged(), false);
    assert.strictEqual(AuthGuard.permitirNav('perfil',    mockRouter()), false);
    assert.strictEqual(AuthGuard.permitirAcao('agendar',  mockRouter()), false);
    assert.strictEqual(AuthGuard.permitirAcao('avatar-upload', mockRouter()), false);

    // 2. Login — acesso liberado
    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AppState.isLogged(),           true);
    assert.strictEqual(AppState.getUserId(),          'u-cliente-01');
    assert.strictEqual(AuthGuard.permitirNav('perfil',    mockRouter()), true);
    assert.strictEqual(AuthGuard.permitirNav('mensagens', mockRouter()), true);
    assert.strictEqual(AuthGuard.permitirAcao('agendar',       mockRouter()), true);
    assert.strictEqual(AuthGuard.permitirAcao('like',          mockRouter()), true);
    assert.strictEqual(AuthGuard.permitirAcao('avatar-upload', mockRouter()), true);

    // 3. Logout — estado limpo, acesso bloqueado novamente
    AppState.logout();
    assert.strictEqual(AppState.isLogged(),    false);
    assert.strictEqual(AppState.getUserId(),   null);
    assert.strictEqual(AppState.get('perfil'), null);

    const r = mockRouter();
    assert.strictEqual(AuthGuard.permitirNav('perfil', r), false);
    assert.deepStrictEqual(r._calls, ['login']); // redirecionou para login
  });

  test('listener onAuth() acompanha ciclo: login → logout → login', () => {
    const { AppState } = novoGuard();
    const log = [];
    AppState.onAuth(v => log.push(v));

    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);  // true
    AppState.logout();                              // false
    AppState.login(USER_PRO, PERFIL_PRO);           // true

    assert.deepStrictEqual(log, [true, false, true]);
  });

  test('múltiplas sessões sequenciais não vazam estado entre si', () => {
    const { AppState } = novoGuard();

    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AppState.getUserId(), 'u-cliente-01');
    assert.strictEqual(AppState.getRole(),   'client');

    AppState.logout();

    AppState.login(USER_PRO, PERFIL_PRO);
    assert.strictEqual(AppState.getUserId(), 'u-pro-01');
    assert.strictEqual(AppState.getRole(),   'professional');
    assert.strictEqual(AppState.isLogged(),  true);
  });

  test('ações protegidas bloqueiam após logout (sem re-login)', () => {
    const { AppState, AuthGuard } = novoGuard();

    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    assert.strictEqual(AuthGuard.permitirAcao('agendar', mockRouter()), true);

    AppState.logout();

    const r = mockRouter();
    assert.strictEqual(AuthGuard.permitirAcao('agendar', r), false);
    assert.deepStrictEqual(r._calls, ['login']);
  });

  test('geo não vaza entre sessões', () => {
    const { AppState } = novoGuard();

    AppState.login(USER_CLIENTE, PERFIL_CLIENTE);
    AppState.setGeo({ lat: -23.5, lng: -46.6 });
    AppState.logout();

    assert.strictEqual(AppState.get('geo'), null);

    // Nova sessão inicia sem geo da sessão anterior
    AppState.login(USER_PRO, PERFIL_PRO);
    assert.strictEqual(AppState.get('geo'), null);
  });

});
