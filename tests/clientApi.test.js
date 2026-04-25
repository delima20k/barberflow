'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const UUID_CLIENTE      = 'a0000000-0000-4000-8000-000000000001';
const UUID_PROFISSIONAL = 'a0000000-0000-4000-8000-000000000002';
const UUID_BARBEARIA    = 'a0000000-0000-4000-8000-000000000003';
const UUID_SERVICO      = 'a0000000-0000-4000-8000-000000000004';
const UUID_AGENDAMENTO  = 'a0000000-0000-4000-8000-000000000005';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sandbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria sandbox com fetch e localStorage mockados.
 * Carrega em ordem: InputValidator → ApiService → AppointmentRepository.
 * @param {Function} fetchMock — async(url, opts) => Response
 * @param {string|null} jwtToken
 */
function criarSandbox(fetchMock, jwtToken = null) {
  const lsMock = {
    getItem: (k) =>
      k.includes('auth-token') && jwtToken
        ? JSON.stringify({ access_token: jwtToken })
        : null,
  };
  const sandbox = vm.createContext({
    console,
    localStorage: lsMock,
    fetch:         fetchMock,
    URLSearchParams,
    Error,
    TypeError,
  });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/ApiService.js');
  carregar(sandbox, 'shared/js/AppointmentRepository.js');
  return sandbox;
}

/** Resposta HTTP fake de sucesso */
function resOk(body) {
  return async () => ({
    ok:     true,
    status: 200,
    text:   async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json:   async () => body,
  });
}

/** Resposta HTTP fake de erro */
function resErro(status, body) {
  return async () => ({
    ok:     false,
    status,
    text:   async () => JSON.stringify(body),
    json:   async () => body,
  });
}

/** Payload mínimo válido para criar agendamento */
function payloadValido(extra = {}) {
  return {
    client_id:       UUID_CLIENTE,
    professional_id: UUID_PROFISSIONAL,
    barbershop_id:   UUID_BARBEARIA,
    service_id:      UUID_SERVICO,
    scheduled_at:    '2026-06-01T10:00:00Z',
    duration_min:    30,
    price_charged:   50,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

suite('AppointmentRepository — criar()', () => {

  test('envia POST para /rest/v1/appointments com payload válido', async () => {
    let url, opts;
    const sb = criarSandbox(
      async (u, o) => { url = u; opts = o; return resOk({ id: UUID_AGENDAMENTO })(); },
      'tok.en.jwt',
    );

    const result = await sb.AppointmentRepository.criar(payloadValido());

    assert.ok(url.includes('/rest/v1/appointments'), 'URL aponta para appointments');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    assert.equal(opts.headers['Prefer'], 'return=representation');
    assert.ok(decodeURIComponent(url).includes('select=id'), 'select=id no retorno');
    assert.equal(result.id, UUID_AGENDAMENTO);
  });

  test('rejeita client_id com UUID inválido', async () => {
    const sb = criarSandbox(resOk({}), 'tok.en.jwt');

    await assert.rejects(
      () => sb.AppointmentRepository.criar(payloadValido({ client_id: 'nao-e-uuid' })),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('client_id'), `mensagem deve mencionar campo: ${err.message}`);
        return true;
      },
    );
  });

  test('descarta campos extras — previne mass assignment', async () => {
    let opts;
    const sb = criarSandbox(
      async (u, o) => { opts = o; return resOk({ id: UUID_AGENDAMENTO })(); },
      'tok.en.jwt',
    );

    await sb.AppointmentRepository.criar(payloadValido({ admin: true, role: 'god_mode' }));

    const body = JSON.parse(opts.body);
    assert.ok(!('admin' in body),  'admin deve ser descartado');
    assert.ok(!('role' in body),   'role deve ser descartado');
    assert.ok('client_id' in body, 'client_id deve ser mantido');
  });

  test('rejeita notes com mais de 500 caracteres', async () => {
    const sb = criarSandbox(resOk({}), 'tok.en.jwt');

    await assert.rejects(
      () => sb.AppointmentRepository.criar(payloadValido({ notes: 'x'.repeat(501) })),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('notes'), `mensagem deve mencionar campo: ${err.message}`);
        return true;
      },
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('AppointmentRepository — getByCliente()', () => {

  test('gera GET com client_id, gte scheduled_at, order e limit', async () => {
    let url;
    const sb = criarSandbox(
      async (u) => { url = u; return resOk([{ id: UUID_AGENDAMENTO }])(); },
      'tok.en.jwt',
    );

    const result = await sb.AppointmentRepository.getByCliente(UUID_CLIENTE);

    const decoded = decodeURIComponent(url);
    assert.ok(url.includes('/rest/v1/appointments'), 'URL aponta para appointments');
    assert.ok(decoded.includes(`client_id=eq.${UUID_CLIENTE}`), 'filtro client_id');
    assert.ok(decoded.includes('scheduled_at=gte.'), 'filtro gte scheduled_at');
    assert.ok(decoded.includes('order=scheduled_at.asc'), 'ordem ascendente');
    assert.ok(decoded.includes('limit=50'), 'limite 50');
    assert.equal(result.length, 1);
  });

  test('retorna [] sem lançar erro quando resposta vazia', async () => {
    const sb = criarSandbox(resOk([]), 'tok.en.jwt');

    const result = await sb.AppointmentRepository.getByCliente(UUID_CLIENTE);

    assert.equal(Array.isArray(result), true);
    assert.equal(result.length, 0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('AppointmentRepository — updateStatus()', () => {

  test('envia PATCH com status válido e updated_at', async () => {
    let url, opts;
    const sb = criarSandbox(
      async (u, o) => { url = u; opts = o; return resOk({ id: UUID_AGENDAMENTO, status: 'confirmed' })(); },
      'tok.en.jwt',
    );

    const result = await sb.AppointmentRepository.updateStatus(UUID_AGENDAMENTO, 'confirmed');

    const decoded = decodeURIComponent(url);
    assert.ok(url.includes('/rest/v1/appointments'), 'URL aponta para appointments');
    assert.equal(opts.method, 'PATCH');
    assert.ok(decoded.includes(`id=eq.${UUID_AGENDAMENTO}`), 'filtro por id');
    const body = JSON.parse(opts.body);
    assert.equal(body.status, 'confirmed');
    assert.ok('updated_at' in body, 'updated_at obrigatório no PATCH');
    assert.equal(result.status, 'confirmed');
  });

  test('rejeita status inválido sem chamar fetch', async () => {
    let chamado = false;
    const sb = criarSandbox(async () => { chamado = true; return resOk({})(); }, 'tok.en.jwt');

    await assert.rejects(
      () => sb.AppointmentRepository.updateStatus(UUID_AGENDAMENTO, 'xpto'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Status inválido'), `mensagem esperada: ${err.message}`);
        return true;
      },
    );
    assert.equal(chamado, false, 'fetch não deve ser chamado com status inválido');
  });

});
