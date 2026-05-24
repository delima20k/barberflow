'use strict';

/**
 * tests/fila-notificacao-profissional.test.js
 *
 * Valida a lógica de notificações do trigger fn_notify_queue_clients.
 *
 * A implementação real é PL/pgSQL — este teste documenta e valida
 * o comportamento esperado como lógica JS equivalente, garantindo
 * cobertura de todos os cenários antes de aplicar a migration.
 *
 * Cenários cobertos:
 *   1. status ≠ 'done' → nenhuma notificação
 *   2. Fila com clientes cadastrados + profissional → clientes + queue_next_client
 *   3. Fila com walk-in (sem client_id) → profissional recebe guest_name
 *   4. Fila vazia → profissional recebe queue_empty
 *   5. sem professional_id → não gera notificação para profissional
 *   6. múltiplos clientes → posições corretas + profissional recebe o primeiro
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');

// ─── Lógica equivalente ao trigger fn_notify_queue_clients ───────────────────
// Espelha exatamente o que o SQL deve fazer. Atualizar aqui SE a migration mudar.

/**
 * @param {{ id: string, status: string, professional_id: string|null, barbershop_id: string }} entry
 *   A entrada que acabou de mudar de status (equivalente ao NEW do trigger).
 * @param {Array<{ id: string, client_id: string|null, guest_name: string|null, full_name: string|null, position: number }>} waiting
 *   Todas as entradas com status='waiting' na mesma barbearia.
 * @returns {Array<{ user_id: string, type: string, title: string, body: string, data: object }>}
 */
function simularTrigger(entry, waiting) {
  const notificacoes = [];

  if (entry.status !== 'done') return notificacoes;

  // ── 1. Notificar clientes cadastrados em espera (loop existente) ──────────
  const comConta = waiting
    .filter(w => w.client_id != null)
    .sort((a, b) => a.position - b.position);

  comConta.forEach((w, idx) => {
    const rank = idx + 1;
    notificacoes.push({
      user_id: w.client_id,
      type:    'queue_update',
      title:   'Fila avançou',
      body:    rank === 1
        ? 'Você é o próximo! Dirija-se à cadeira.'
        : `Você está na posição ${rank} da fila.`,
      data: {
        position:      rank,
        barbershop_id: entry.barbershop_id,
        is_next:       rank === 1,
      },
    });
  });

  // ── 2. Notificar profissional (inclui walk-ins na determinação do próximo) ─
  if (!entry.professional_id) return notificacoes;

  const todosOrdenados = [...waiting].sort((a, b) => a.position - b.position);

  if (todosOrdenados.length > 0) {
    const proximo     = todosOrdenados[0];
    const nomeProximo = proximo.full_name ?? proximo.guest_name ?? 'Cliente walk-in';

    notificacoes.push({
      user_id: entry.professional_id,
      type:    'queue_next_client',
      title:   'Próximo cliente',
      body:    `${nomeProximo} está aguardando na fila.`,
      data: {
        entry_id:      proximo.id,
        client_name:   nomeProximo,
        barbershop_id: entry.barbershop_id,
        is_next:       true,
      },
    });
  } else {
    notificacoes.push({
      user_id: entry.professional_id,
      type:    'queue_empty',
      title:   'Fila vazia',
      body:    'Não há mais clientes aguardando.',
      data:    { barbershop_id: entry.barbershop_id },
    });
  }

  return notificacoes;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SHOP_ID  = 'bbbbbbbb-0000-4000-8000-000000000001';
const PROF_ID  = 'pppppppp-0000-4000-8000-000000000001';
const CLI_A    = 'cccccccc-0000-4000-8000-000000000001';
const CLI_B    = 'cccccccc-0000-4000-8000-000000000002';

function entradaDone(overrides = {}) {
  return { id: 'eeee0000', status: 'done', professional_id: PROF_ID, barbershop_id: SHOP_ID, ...overrides };
}

function clienteEsperando({ id, client_id, full_name = null, guest_name = null, position }) {
  return { id, client_id, full_name, guest_name, position };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('fn_notify_queue_clients — lógica do trigger', () => {

  test('status diferente de done → nenhuma notificação', () => {
    const notifs = simularTrigger(
      entradaDone({ status: 'in_service' }),
      [clienteEsperando({ id: 'e1', client_id: CLI_A, full_name: 'Ana', position: 1 })],
    );
    assert.equal(notifs.length, 0);
  });

  test('fila com 1 cliente cadastrado → queue_update (posição 1) + queue_next_client para profissional', () => {
    const notifs = simularTrigger(
      entradaDone(),
      [clienteEsperando({ id: 'e1', client_id: CLI_A, full_name: 'Ana', position: 1 })],
    );

    assert.equal(notifs.length, 2);

    const clienteNotif = notifs.find(n => n.user_id === CLI_A);
    assert.ok(clienteNotif, 'cliente deve receber notificação');
    assert.equal(clienteNotif.type, 'queue_update');
    assert.equal(clienteNotif.body, 'Você é o próximo! Dirija-se à cadeira.');
    assert.equal(clienteNotif.data.position, 1);
    assert.equal(clienteNotif.data.is_next, true);

    const profNotif = notifs.find(n => n.user_id === PROF_ID);
    assert.ok(profNotif, 'profissional deve receber notificação');
    assert.equal(profNotif.type, 'queue_next_client');
    assert.equal(profNotif.title, 'Próximo cliente');
    assert.equal(profNotif.data.entry_id, 'e1');
    assert.equal(profNotif.data.client_name, 'Ana');
    assert.equal(profNotif.data.is_next, true);
  });

  test('fila com walk-in (sem client_id) → profissional recebe guest_name, nenhuma notificação ao walk-in', () => {
    const notifs = simularTrigger(
      entradaDone(),
      [clienteEsperando({ id: 'e2', client_id: null, guest_name: 'João Walk-in', position: 1 })],
    );

    // walk-in não recebe queue_update (sem conta)
    const clienteNotifs = notifs.filter(n => n.type === 'queue_update');
    assert.equal(clienteNotifs.length, 0, 'walk-in não deve receber queue_update');

    // profissional recebe com guest_name
    const profNotif = notifs.find(n => n.user_id === PROF_ID);
    assert.ok(profNotif, 'profissional deve receber notificação para walk-in');
    assert.equal(profNotif.type, 'queue_next_client');
    assert.equal(profNotif.data.client_name, 'João Walk-in');
  });

  test('fila vazia → profissional recebe queue_empty, nenhum cliente notificado', () => {
    const notifs = simularTrigger(entradaDone(), []);

    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].user_id, PROF_ID);
    assert.equal(notifs[0].type, 'queue_empty');
    assert.equal(notifs[0].title, 'Fila vazia');
    assert.equal(notifs[0].data.barbershop_id, SHOP_ID);
  });

  test('sem professional_id → apenas clientes são notificados', () => {
    const notifs = simularTrigger(
      entradaDone({ professional_id: null }),
      [clienteEsperando({ id: 'e1', client_id: CLI_A, full_name: 'Ana', position: 1 })],
    );

    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].user_id, CLI_A);
    assert.equal(notifs[0].type, 'queue_update');
  });

  test('múltiplos clientes → posições corretas + profissional recebe o primeiro da fila', () => {
    const waiting = [
      clienteEsperando({ id: 'e2', client_id: CLI_B, full_name: 'Bruno', position: 2 }),
      clienteEsperando({ id: 'e1', client_id: CLI_A, full_name: 'Ana',   position: 1 }),
    ];

    const notifs = simularTrigger(entradaDone(), waiting);

    // 2 clientes + 1 profissional = 3
    assert.equal(notifs.length, 3);

    const notifA = notifs.find(n => n.user_id === CLI_A);
    const notifB = notifs.find(n => n.user_id === CLI_B);

    assert.equal(notifA.data.position, 1, 'Ana deve estar na posição 1');
    assert.equal(notifA.data.is_next, true);
    assert.equal(notifA.body, 'Você é o próximo! Dirija-se à cadeira.');

    assert.equal(notifB.data.position, 2, 'Bruno deve estar na posição 2');
    assert.equal(notifB.data.is_next, false);
    assert.ok(notifB.body.includes('posição 2'));

    const profNotif = notifs.find(n => n.user_id === PROF_ID);
    assert.equal(profNotif.type, 'queue_next_client');
    assert.equal(profNotif.data.client_name, 'Ana', 'profissional deve receber o primeiro da fila');
    assert.equal(profNotif.data.entry_id, 'e1');
  });

  test('walk-in é o primeiro, cliente com conta é segundo → profissional recebe walk-in', () => {
    const waiting = [
      clienteEsperando({ id: 'e1', client_id: null,  guest_name: 'Walk-in',  position: 1 }),
      clienteEsperando({ id: 'e2', client_id: CLI_A, full_name:  'Ana',      position: 2 }),
    ];

    const notifs = simularTrigger(entradaDone(), waiting);

    // CLI_A recebe posição 1 no loop de cadastrados (único com client_id)
    const notifA = notifs.find(n => n.user_id === CLI_A);
    assert.equal(notifA.data.position, 1);

    // Profissional recebe o walk-in (posição 1 absoluta)
    const profNotif = notifs.find(n => n.user_id === PROF_ID);
    assert.equal(profNotif.data.client_name, 'Walk-in');
    assert.equal(profNotif.data.entry_id, 'e1');
  });
});
