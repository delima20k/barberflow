'use strict';
const { suite, test, beforeEach } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

/** Carrega InputValidator.js em um sandbox VM isolado. */
function criarInputValidator() {
  const sandbox = vm.createContext({ console });
  carregar(sandbox, 'shared/js/InputValidator.js');
  return sandbox.InputValidator;
}

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.textoLivre()
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.textoLivre()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita texto normal dentro do limite', () => {
    const r = IV.textoLivre('Cabelo e barba, por favor!');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'Cabelo e barba, por favor!');
  });

  test('retorna string trimada no valor', () => {
    const r = IV.textoLivre('  espaços nas bordas  ');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'espaços nas bordas');
  });

  test('rejeita string maior que maxLen', () => {
    const r = IV.textoLivre('x'.repeat(501));
    assert.strictEqual(r.ok, false);
    assert.match(String(r.msg), /500/);
  });

  test('respeita maxLen customizado', () => {
    assert.strictEqual(IV.textoLivre('abc', 2).ok, false);
    assert.strictEqual(IV.textoLivre('ab', 2).ok, true);
  });

  test('remove null-bytes silenciosamente (prevenção de ataques de truncamento)', () => {
    const r = IV.textoLivre('texto\x00malicioso');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'textom alicioso'.replace(' ', ''));
  });

  test('remove null-byte no meio de string SQL-like', () => {
    const r = IV.textoLivre("admin\x00' OR '1'='1");
    assert.strictEqual(r.ok, true);
    assert.ok(!(r.valor).includes('\x00'));
  });

  test('texto vazio é aceito quando não obrigatório', () => {
    assert.strictEqual(IV.textoLivre('').ok, true);
    assert.strictEqual(IV.textoLivre(null).ok, true);
    assert.strictEqual(IV.textoLivre(undefined).ok, true);
  });

  test('texto vazio é rejeitado quando obrigatório', () => {
    assert.strictEqual(IV.textoLivre('', 500, true).ok, false);
    assert.strictEqual(IV.textoLivre('   ', 500, true).ok, false);
  });

  test('strings com aspas e hífens (SQL-like) são aceitas — Supabase usa queries parametrizadas', () => {
    // "'; DROP TABLE appointments; --" é uma string válida de notas
    // A parametrização no Supabase/PostgREST garante que não é interpretada como SQL
    const sqlInjection = "'; DROP TABLE appointments; --";
    const r = IV.textoLivre(sqlInjection);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, sqlInjection);
  });

  test('strings com UNION SELECT são aceitas como texto (não executadas como SQL)', () => {
    const r = IV.textoLivre("1 UNION SELECT * FROM users WHERE '1'='1");
    assert.strictEqual(r.ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.coordenada()
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.coordenada()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita coordenadas válidas de São Paulo', () => {
    assert.strictEqual(IV.coordenada(-23.5505, -46.6333).ok, true);
  });

  test('aceita coordenadas dos polos', () => {
    assert.strictEqual(IV.coordenada(90, 0).ok, true);
    assert.strictEqual(IV.coordenada(-90, 0).ok, true);
    assert.strictEqual(IV.coordenada(0, 180).ok, true);
    assert.strictEqual(IV.coordenada(0, -180).ok, true);
  });

  test('rejeita latitude > 90', () => {
    assert.strictEqual(IV.coordenada(91, 0).ok, false);
  });

  test('rejeita latitude < -90', () => {
    assert.strictEqual(IV.coordenada(-91, 0).ok, false);
  });

  test('rejeita longitude > 180', () => {
    assert.strictEqual(IV.coordenada(0, 181).ok, false);
  });

  test('rejeita longitude < -180', () => {
    assert.strictEqual(IV.coordenada(0, -181).ok, false);
  });

  test('rejeita NaN', () => {
    assert.strictEqual(IV.coordenada(NaN, 0).ok, false);
    assert.strictEqual(IV.coordenada(0, NaN).ok, false);
  });

  test('rejeita Infinity', () => {
    assert.strictEqual(IV.coordenada(Infinity, 0).ok, false);
    assert.strictEqual(IV.coordenada(0, -Infinity).ok, false);
  });

  test('rejeita string (mesmo que pareça número)', () => {
    assert.strictEqual(IV.coordenada('-23.5505', -46.6333).ok, false);
    assert.strictEqual(IV.coordenada(-23.5505, '-46.6333').ok, false);
  });

  test('rejeita null/undefined', () => {
    assert.strictEqual(IV.coordenada(null, 0).ok, false);
    assert.strictEqual(IV.coordenada(0, undefined).ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.intPositivo()
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.intPositivo()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita inteiro positivo válido', () => {
    assert.strictEqual(IV.intPositivo(10).ok, true);
    assert.strictEqual(IV.intPositivo(1).ok, true);
    assert.strictEqual(IV.intPositivo(1000).ok, true);
  });

  test('rejeita zero', () => {
    assert.strictEqual(IV.intPositivo(0).ok, false);
  });

  test('rejeita negativo', () => {
    assert.strictEqual(IV.intPositivo(-1).ok, false);
  });

  test('rejeita float', () => {
    assert.strictEqual(IV.intPositivo(3.5).ok, false);
    assert.strictEqual(IV.intPositivo(1.0001).ok, false);
  });

  test('rejeita maior que max padrão (1000)', () => {
    const r = IV.intPositivo(1001);
    assert.strictEqual(r.ok, false);
    assert.match(String(r.msg), /1000/);
  });

  test('respeita max customizado', () => {
    assert.strictEqual(IV.intPositivo(51, 50).ok, false);
    assert.strictEqual(IV.intPositivo(50, 50).ok, true);
  });

  test('rejeita string', () => {
    assert.strictEqual(IV.intPositivo('10').ok, false);
  });

  test('rejeita NaN', () => {
    assert.strictEqual(IV.intPositivo(NaN).ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.enumValido()
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.enumValido()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  const STATUS_AGENDAMENTO = ['pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'];

  test('aceita valor presente na lista', () => {
    assert.strictEqual(IV.enumValido('confirmed', STATUS_AGENDAMENTO).ok, true);
    assert.strictEqual(IV.enumValido('done', STATUS_AGENDAMENTO).ok, true);
  });

  test('rejeita valor fora da lista', () => {
    assert.strictEqual(IV.enumValido('aprovado', STATUS_AGENDAMENTO).ok, false);
  });

  test('é case-sensitive', () => {
    assert.strictEqual(IV.enumValido('CONFIRMED', STATUS_AGENDAMENTO).ok, false);
    assert.strictEqual(IV.enumValido('Done', STATUS_AGENDAMENTO).ok, false);
  });

  test('rejeita string de SQL injection como status', () => {
    assert.strictEqual(IV.enumValido("'; DROP TABLE appointments; --", STATUS_AGENDAMENTO).ok, false);
    assert.strictEqual(IV.enumValido("confirmed' OR '1'='1", STATUS_AGENDAMENTO).ok, false);
    assert.strictEqual(IV.enumValido('1; SELECT * FROM users', STATUS_AGENDAMENTO).ok, false);
  });

  test('rejeita string vazia', () => {
    assert.strictEqual(IV.enumValido('', STATUS_AGENDAMENTO).ok, false);
  });

  test('rejeita undefined/null', () => {
    assert.strictEqual(IV.enumValido(undefined, STATUS_AGENDAMENTO).ok, false);
    assert.strictEqual(IV.enumValido(null, STATUS_AGENDAMENTO).ok, false);
  });

  test('mensagem de erro inclui o valor rejeitado', () => {
    const r = IV.enumValido('hacker', STATUS_AGENDAMENTO);
    assert.ok((r.msg).includes('hacker'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.payload() — allowlist de campos (prevenção de mass assignment)
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.payload()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  const CAMPOS_PERFIL = ['full_name', 'phone', 'bio', 'city'];

  test('retorna apenas campos permitidos', () => {
    const r = IV.payload({ full_name: 'João', phone: '11999999999' }, CAMPOS_PERFIL);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.valor, { full_name: 'João', phone: '11999999999' });
  });

  test('descarta campos extras silenciosamente (prevenção de mass assignment)', () => {
    const r = IV.payload({ full_name: 'João', role: 'admin', is_active: true }, CAMPOS_PERFIL);
    assert.strictEqual(r.ok, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(r.valor, 'role'));
    assert.ok(!Object.prototype.hasOwnProperty.call(r.valor, 'is_active'));
    assert.strictEqual(r.valor['full_name'], 'João');
  });

  test('descarta campo com nome de SQL injection', () => {
    const malicioso = { "full_name': 'admin'--": 'x', full_name: 'João' };
    const r = IV.payload(malicioso, CAMPOS_PERFIL);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(Object.keys(r.valor), ['full_name']);
  });

  test('rejeita objeto sem nenhum campo permitido', () => {
    const r = IV.payload({ role: 'admin', is_admin: true }, CAMPOS_PERFIL);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.valor, {});
  });

  test('rejeita array (não é objeto de dados)', () => {
    const r = IV.payload(['full_name', 'admin'], CAMPOS_PERFIL);
    assert.strictEqual(r.ok, false);
  });

  test('rejeita null', () => {
    assert.strictEqual(IV.payload(null, CAMPOS_PERFIL).ok, false);
  });

  test('rejeita string', () => {
    assert.strictEqual(IV.payload('full_name=admin', CAMPOS_PERFIL).ok, false);
  });

  test('preserva campos com valores falsy legítimos (zero, false, null)', () => {
    const r = IV.payload({ bio: null, city: 'SP' }, CAMPOS_PERFIL);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor['bio'], null);
    assert.strictEqual(r.valor['city'], 'SP');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.sanitizar() — inputs maliciosos adicionais
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.sanitizar() com inputs maliciosos', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('escapa script tag completa', () => {
    const r = IV.sanitizar('<script>alert("xss")</script>');
    assert.ok(!(r).includes('<script>'));
    assert.ok((r).includes('&lt;script&gt;'));
  });

  test('escapa evento inline (onerror)', () => {
    const r = IV.sanitizar('"><img src=x onerror=alert(1)>');
    assert.ok(!(r).includes('<img'));
    assert.ok(!(r).includes('>'));
  });

  test('escapa aspas simples e duplas', () => {
    const r = IV.sanitizar("'; DROP TABLE users; --");
    assert.ok((r).includes('&#x27;'));
    assert.ok(!(r).includes("'"));
  });

  test('retorna string vazia para não-string', () => {
    assert.strictEqual(IV.sanitizar(null), '');
    assert.strictEqual(IV.sanitizar(undefined), '');
    assert.strictEqual(IV.sanitizar(123), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.uuid() — strings de injeção como IDs
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.uuid() com inputs maliciosos', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita UUID v4 válido', () => {
    assert.strictEqual(IV.uuid('550e8400-e29b-41d4-a716-446655440000').ok, true);
  });

  test('rejeita SQL injection como ID', () => {
    assert.strictEqual(IV.uuid("'; DROP TABLE profiles; --").ok, false);
    assert.strictEqual(IV.uuid("1 UNION SELECT password FROM users").ok, false);
    assert.strictEqual(IV.uuid("0 OR 1=1").ok, false);
  });

  test('rejeita ID numérico simples', () => {
    assert.strictEqual(IV.uuid('123').ok, false);
    assert.strictEqual(IV.uuid('1').ok, false);
  });

  test('rejeita string vazia e null', () => {
    assert.strictEqual(IV.uuid('').ok, false);
    assert.strictEqual(IV.uuid(null).ok, false);
  });

  test('rejeita UUID com comprimento errado', () => {
    assert.strictEqual(IV.uuid('550e8400-e29b-41d4-a716').ok, false);
    assert.strictEqual(IV.uuid('550e8400-e29b-41d4-a716-446655440000-extra').ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.escaparFiltroPostgREST() — previne PostgREST filter injection
// ─────────────────────────────────────────────────────────────────────────────
suite('InputValidator.escaparFiltroPostgREST()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('string normal permanece inalterada', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('barbearia central'), 'barbearia central');
  });

  test('remove vírgula (separador de condições OR no PostgREST)', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('a,b'), 'ab');
  });

  test('remove parênteses de abertura (agrupamento de filtros no PostgREST)', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('foo(bar'), 'foobar');
  });

  test('remove parênteses de fechamento (agrupamento de filtros no PostgREST)', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('foo)bar'), 'foobar');
  });

  test('remove aspas duplas (delimitador de valor no PostgREST)', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('nome "perigoso"'), 'nome perigoso');
  });

  test('remove combinação de todos os chars especiais', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('a,b(c)d"e'), 'abcde');
  });

  test('retorna string vazia para null', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST(null), '');
  });

  test('retorna string vazia para undefined', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST(undefined), '');
  });

  test('retorna string vazia para string composta só de espaços', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('   '), '');
  });

  test('tentativa de injeção de condição OR extra via vírgula', () => {
    // Sem escaping: "bar%,is_active.eq.true%" quebraria a lógica de filtro PostgREST
    const tentativa = 'bar%,is_active.eq.true%';
    const escaped = IV.escaparFiltroPostgREST(tentativa);
    assert.ok(!escaped.includes(','), 'vírgula não deve sobreviver ao escaping');
  });

  test('tentativa de agrupamento de condições via parênteses', () => {
    const tentativa = 'foo(bar.eq.true)';
    const escaped = IV.escaparFiltroPostgREST(tentativa);
    assert.ok(!escaped.includes('(') && !escaped.includes(')'));
  });

  test('preserva acentos e caracteres unicode legítimos', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('barbearia são paulo'), 'barbearia são paulo');
  });

  test('preserva hífen, números e letras maiúsculas', () => {
    assert.strictEqual(IV.escaparFiltroPostgREST('Barber-Shop 2'), 'Barber-Shop 2');
  });
});
