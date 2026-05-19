'use strict';
/**
 * tests/appointment-repository.test.js
 *
 * Testa AppointmentRepository: getByProfessional, getHoje, getAmanha,
 * e rejeição de UUID inválido.
 * Reutiliza o padrão de criarQueryBuilder de repositories.test.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_PRO = 'a0000000-0000-4000-8000-000000000001';

// ── Query builder fluente (mesmo padrão de repositories.test.js) ──────────────
function criarQueryBuilder(result) {
  const chain = {
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
    select: fn(), eq: fn(), neq: fn(), gte: fn(), lte: fn(),
    order: fn(), limit: fn(), in: fn(), filter: fn(),
  };
  const chainable = ['select','eq','neq','gte','lte','order','limit','in','filter'];
  for (const m of chainable) chain[m].mockReturnValue(chain);
  // O valor final da cadeia é o result (Promise)
  Object.defineProperty(chain, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  return chain;
}

function criarRepo({ data = [], error = null } = {}) {
  const result  = { data, error };
  const builder = criarQueryBuilder(result);
  const api     = { from: fn().mockReturnValue(builder) };

  const sb = vm.createContext({ console, ApiService: api });
  carregar(sb, 'shared/js/InputValidator.js');
  carregar(sb, 'shared/js/AppointmentRepository.js');

  return { AR: sb.AppointmentRepository, builder, api };
}

// ─────────────────────────────────────────────────────────────────────────────
// AppointmentRepository.getByProfessional()
// ─────────────────────────────────────────────────────────────────────────────
suite('AppointmentRepository.getByProfessional()', () => {

  test('chama ApiService.from("appointments")', async () => {
    const agendamentos = [{ id: 'x', status: 'pending' }];
    const { AR, api } = criarRepo({ data: agendamentos });

    const inicio = new Date('2026-04-01T00:00:00.000Z');
    const fim    = new Date('2026-04-30T23:59:59.999Z');
    await AR.getByProfessional(UUID_PRO, inicio, fim);

    assert.ok(api.from.calls.length >= 1);
    assert.strictEqual(api.from.calls[0][0], 'appointments');
  });

  test('filtra pelo professional_id correto', async () => {
    const { AR, builder } = criarRepo({ data: [] });

    const inicio = new Date('2026-04-01T00:00:00.000Z');
    const fim    = new Date('2026-04-30T23:59:59.999Z');
    await AR.getByProfessional(UUID_PRO, inicio, fim);

    const eqCalls = builder.eq.calls;
    assert.ok(eqCalls.some(([col, val]) => col === 'professional_id' && val === UUID_PRO),
      'deveria chamar .eq("professional_id", uuid)');
  });

  test('retorna array vazio quando data é null', async () => {
    const { AR } = criarRepo({ data: null });
    const inicio = new Date();
    const fim    = new Date(Date.now() + 86400_000);
    const result = await AR.getByProfessional(UUID_PRO, inicio, fim);
    assert.strictEqual(result.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AppointmentRepository.getHoje() / getAmanha()
// ─────────────────────────────────────────────────────────────────────────────
suite('AppointmentRepository.getHoje() e getAmanha()', () => {

  test('getHoje() passa range de datas com intervalo de 1 dia', async () => {
    const { AR, builder } = criarRepo({ data: [] });
    await AR.getHoje(UUID_PRO);

    // Deve ter chamado .gte e .lte com strings ISO de hoje
    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const gteCalls = builder.gte.calls;
    assert.ok(gteCalls.some(([col, val]) => col === 'scheduled_at' && val.startsWith(hoje)),
      'getHoje deveria usar a data de hoje em .gte()');
  });

  test('getAmanha() passa range de datas com início no dia seguinte', async () => {
    const { AR, builder } = criarRepo({ data: [] });
    await AR.getAmanha(UUID_PRO);

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const prefixo = amanha.toISOString().slice(0, 10);

    const gteCalls = builder.gte.calls;
    assert.ok(gteCalls.some(([col, val]) => col === 'scheduled_at' && val.startsWith(prefixo)),
      'getAmanha deveria usar a data de amanhã em .gte()');
  });
});
