'use strict';

/**
 * tests/input-validator.test.js
 *
 * Testes para InputValidator — validação, sanitização e controle de inputs
 * maliciosos antes que cheguem à camada de dados.
 *
 * Cobre os novos métodos adicionados para segurança da camada de dados:
 *   textoLivre()  — texto de usuário com limite de comprimento e remoção de null-bytes
 *   coordenada()  — pares lat/lng com verificação de range
 *   intPositivo() — limites numéricos para parâmetros de paginação
 *   enumValido()  — allowlist de valores aceitos (previne injeção em campos de status)
 *   payload()     — allowlist de chaves de objeto (previne mass assignment)
 *
 * Também cobre cenários de inputs maliciosos nos métodos já existentes:
 *   sanitizar()   — XSS, SQL-like strings, null-bytes
 *   uuid()        — strings de injeção, formato inválido
 *
 * Runner: Jest — npm test
 */

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/**
 * Carrega um arquivo JS no sandbox VM e exporta todos os símbolos top-level.
 * O padrão globalThis.X = X é necessário porque class declarations em strict mode
 * não são adicionadas automaticamente ao objeto global do contexto VM.
 */
function carregar(sandbox, relPath) {
  const raw   = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const nomes = [...raw.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${raw}\n${exp}`, sandbox);
}

/** Carrega InputValidator.js em um sandbox VM isolado. */
function criarInputValidator() {
  const sandbox = vm.createContext({ console });
  carregar(sandbox, 'shared/js/InputValidator.js');
  return sandbox.InputValidator;
}

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.textoLivre()
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.textoLivre()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita texto normal dentro do limite', () => {
    const r = IV.textoLivre('Cabelo e barba, por favor!');
    expect(r.ok).toBe(true);
    expect(r.valor).toBe('Cabelo e barba, por favor!');
  });

  test('retorna string trimada no valor', () => {
    const r = IV.textoLivre('  espaços nas bordas  ');
    expect(r.ok).toBe(true);
    expect(r.valor).toBe('espaços nas bordas');
  });

  test('rejeita string maior que maxLen', () => {
    const r = IV.textoLivre('x'.repeat(501));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/500/);
  });

  test('respeita maxLen customizado', () => {
    expect(IV.textoLivre('abc', 2).ok).toBe(false);
    expect(IV.textoLivre('ab', 2).ok).toBe(true);
  });

  test('remove null-bytes silenciosamente (prevenção de ataques de truncamento)', () => {
    const r = IV.textoLivre('texto\x00malicioso');
    expect(r.ok).toBe(true);
    expect(r.valor).toBe('textom alicioso'.replace(' ', ''));
  });

  test('remove null-byte no meio de string SQL-like', () => {
    const r = IV.textoLivre("admin\x00' OR '1'='1");
    expect(r.ok).toBe(true);
    expect(r.valor).not.toContain('\x00');
  });

  test('texto vazio é aceito quando não obrigatório', () => {
    expect(IV.textoLivre('').ok).toBe(true);
    expect(IV.textoLivre(null).ok).toBe(true);
    expect(IV.textoLivre(undefined).ok).toBe(true);
  });

  test('texto vazio é rejeitado quando obrigatório', () => {
    expect(IV.textoLivre('', 500, true).ok).toBe(false);
    expect(IV.textoLivre('   ', 500, true).ok).toBe(false);
  });

  test('strings com aspas e hífens (SQL-like) são aceitas — Supabase usa queries parametrizadas', () => {
    // "'; DROP TABLE appointments; --" é uma string válida de notas
    // A parametrização no Supabase/PostgREST garante que não é interpretada como SQL
    const sqlInjection = "'; DROP TABLE appointments; --";
    const r = IV.textoLivre(sqlInjection);
    expect(r.ok).toBe(true);
    expect(r.valor).toBe(sqlInjection);
  });

  test('strings com UNION SELECT são aceitas como texto (não executadas como SQL)', () => {
    const r = IV.textoLivre("1 UNION SELECT * FROM users WHERE '1'='1");
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.coordenada()
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.coordenada()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita coordenadas válidas de São Paulo', () => {
    expect(IV.coordenada(-23.5505, -46.6333).ok).toBe(true);
  });

  test('aceita coordenadas dos polos', () => {
    expect(IV.coordenada(90, 0).ok).toBe(true);
    expect(IV.coordenada(-90, 0).ok).toBe(true);
    expect(IV.coordenada(0, 180).ok).toBe(true);
    expect(IV.coordenada(0, -180).ok).toBe(true);
  });

  test('rejeita latitude > 90', () => {
    expect(IV.coordenada(91, 0).ok).toBe(false);
  });

  test('rejeita latitude < -90', () => {
    expect(IV.coordenada(-91, 0).ok).toBe(false);
  });

  test('rejeita longitude > 180', () => {
    expect(IV.coordenada(0, 181).ok).toBe(false);
  });

  test('rejeita longitude < -180', () => {
    expect(IV.coordenada(0, -181).ok).toBe(false);
  });

  test('rejeita NaN', () => {
    expect(IV.coordenada(NaN, 0).ok).toBe(false);
    expect(IV.coordenada(0, NaN).ok).toBe(false);
  });

  test('rejeita Infinity', () => {
    expect(IV.coordenada(Infinity, 0).ok).toBe(false);
    expect(IV.coordenada(0, -Infinity).ok).toBe(false);
  });

  test('rejeita string (mesmo que pareça número)', () => {
    expect(IV.coordenada('-23.5505', -46.6333).ok).toBe(false);
    expect(IV.coordenada(-23.5505, '-46.6333').ok).toBe(false);
  });

  test('rejeita null/undefined', () => {
    expect(IV.coordenada(null, 0).ok).toBe(false);
    expect(IV.coordenada(0, undefined).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.intPositivo()
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.intPositivo()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita inteiro positivo válido', () => {
    expect(IV.intPositivo(10).ok).toBe(true);
    expect(IV.intPositivo(1).ok).toBe(true);
    expect(IV.intPositivo(1000).ok).toBe(true);
  });

  test('rejeita zero', () => {
    expect(IV.intPositivo(0).ok).toBe(false);
  });

  test('rejeita negativo', () => {
    expect(IV.intPositivo(-1).ok).toBe(false);
  });

  test('rejeita float', () => {
    expect(IV.intPositivo(3.5).ok).toBe(false);
    expect(IV.intPositivo(1.0001).ok).toBe(false);
  });

  test('rejeita maior que max padrão (1000)', () => {
    const r = IV.intPositivo(1001);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/1000/);
  });

  test('respeita max customizado', () => {
    expect(IV.intPositivo(51, 50).ok).toBe(false);
    expect(IV.intPositivo(50, 50).ok).toBe(true);
  });

  test('rejeita string', () => {
    expect(IV.intPositivo('10').ok).toBe(false);
  });

  test('rejeita NaN', () => {
    expect(IV.intPositivo(NaN).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.enumValido()
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.enumValido()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  const STATUS_AGENDAMENTO = ['pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'];

  test('aceita valor presente na lista', () => {
    expect(IV.enumValido('confirmed', STATUS_AGENDAMENTO).ok).toBe(true);
    expect(IV.enumValido('done', STATUS_AGENDAMENTO).ok).toBe(true);
  });

  test('rejeita valor fora da lista', () => {
    expect(IV.enumValido('aprovado', STATUS_AGENDAMENTO).ok).toBe(false);
  });

  test('é case-sensitive', () => {
    expect(IV.enumValido('CONFIRMED', STATUS_AGENDAMENTO).ok).toBe(false);
    expect(IV.enumValido('Done', STATUS_AGENDAMENTO).ok).toBe(false);
  });

  test('rejeita string de SQL injection como status', () => {
    expect(IV.enumValido("'; DROP TABLE appointments; --", STATUS_AGENDAMENTO).ok).toBe(false);
    expect(IV.enumValido("confirmed' OR '1'='1", STATUS_AGENDAMENTO).ok).toBe(false);
    expect(IV.enumValido('1; SELECT * FROM users', STATUS_AGENDAMENTO).ok).toBe(false);
  });

  test('rejeita string vazia', () => {
    expect(IV.enumValido('', STATUS_AGENDAMENTO).ok).toBe(false);
  });

  test('rejeita undefined/null', () => {
    expect(IV.enumValido(undefined, STATUS_AGENDAMENTO).ok).toBe(false);
    expect(IV.enumValido(null, STATUS_AGENDAMENTO).ok).toBe(false);
  });

  test('mensagem de erro inclui o valor rejeitado', () => {
    const r = IV.enumValido('hacker', STATUS_AGENDAMENTO);
    expect(r.msg).toContain('hacker');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.payload() — allowlist de campos (prevenção de mass assignment)
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.payload()', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  const CAMPOS_PERFIL = ['full_name', 'phone', 'bio', 'city'];

  test('retorna apenas campos permitidos', () => {
    const r = IV.payload({ full_name: 'João', phone: '11999999999' }, CAMPOS_PERFIL);
    expect(r.ok).toBe(true);
    expect(r.valor).toEqual({ full_name: 'João', phone: '11999999999' });
  });

  test('descarta campos extras silenciosamente (prevenção de mass assignment)', () => {
    const r = IV.payload({ full_name: 'João', role: 'admin', is_active: true }, CAMPOS_PERFIL);
    expect(r.ok).toBe(true);
    expect(r.valor).not.toHaveProperty('role');
    expect(r.valor).not.toHaveProperty('is_active');
    expect(r.valor).toHaveProperty('full_name', 'João');
  });

  test('descarta campo com nome de SQL injection', () => {
    const malicioso = { "full_name': 'admin'--": 'x', full_name: 'João' };
    const r = IV.payload(malicioso, CAMPOS_PERFIL);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.valor)).toEqual(['full_name']);
  });

  test('rejeita objeto sem nenhum campo permitido', () => {
    const r = IV.payload({ role: 'admin', is_admin: true }, CAMPOS_PERFIL);
    expect(r.ok).toBe(false);
    expect(r.valor).toEqual({});
  });

  test('rejeita array (não é objeto de dados)', () => {
    const r = IV.payload(['full_name', 'admin'], CAMPOS_PERFIL);
    expect(r.ok).toBe(false);
  });

  test('rejeita null', () => {
    expect(IV.payload(null, CAMPOS_PERFIL).ok).toBe(false);
  });

  test('rejeita string', () => {
    expect(IV.payload('full_name=admin', CAMPOS_PERFIL).ok).toBe(false);
  });

  test('preserva campos com valores falsy legítimos (zero, false, null)', () => {
    const r = IV.payload({ bio: null, city: 'SP' }, CAMPOS_PERFIL);
    expect(r.ok).toBe(true);
    expect(r.valor).toHaveProperty('bio', null);
    expect(r.valor).toHaveProperty('city', 'SP');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.sanitizar() — inputs maliciosos adicionais
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.sanitizar() com inputs maliciosos', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('escapa script tag completa', () => {
    const r = IV.sanitizar('<script>alert("xss")</script>');
    expect(r).not.toContain('<script>');
    expect(r).toContain('&lt;script&gt;');
  });

  test('escapa evento inline (onerror)', () => {
    const r = IV.sanitizar('"><img src=x onerror=alert(1)>');
    expect(r).not.toContain('<img');
    expect(r).not.toContain('>');
  });

  test('escapa aspas simples e duplas', () => {
    const r = IV.sanitizar("'; DROP TABLE users; --");
    expect(r).toContain('&#x27;');
    expect(r).not.toContain("'");
  });

  test('retorna string vazia para não-string', () => {
    expect(IV.sanitizar(null)).toBe('');
    expect(IV.sanitizar(undefined)).toBe('');
    expect(IV.sanitizar(123)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InputValidator.uuid() — strings de injeção como IDs
// ─────────────────────────────────────────────────────────────────────────────
describe('InputValidator.uuid() com inputs maliciosos', () => {
  let IV;
  beforeEach(() => { IV = criarInputValidator(); });

  test('aceita UUID v4 válido', () => {
    expect(IV.uuid('550e8400-e29b-41d4-a716-446655440000').ok).toBe(true);
  });

  test('rejeita SQL injection como ID', () => {
    expect(IV.uuid("'; DROP TABLE profiles; --").ok).toBe(false);
    expect(IV.uuid("1 UNION SELECT password FROM users").ok).toBe(false);
    expect(IV.uuid("0 OR 1=1").ok).toBe(false);
  });

  test('rejeita ID numérico simples', () => {
    expect(IV.uuid('123').ok).toBe(false);
    expect(IV.uuid('1').ok).toBe(false);
  });

  test('rejeita string vazia e null', () => {
    expect(IV.uuid('').ok).toBe(false);
    expect(IV.uuid(null).ok).toBe(false);
  });

  test('rejeita UUID com comprimento errado', () => {
    expect(IV.uuid('550e8400-e29b-41d4-a716').ok).toBe(false);
    expect(IV.uuid('550e8400-e29b-41d4-a716-446655440000-extra').ok).toBe(false);
  });
});
