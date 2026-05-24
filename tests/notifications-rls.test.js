'use strict';

/**
 * tests/notifications-rls.test.js
 *
 * Valida todas as regras de segurança da tabela public.notifications.
 * A lógica real é PL/pgSQL — este arquivo espelha o comportamento como JS
 * equivalente para cobertura rápida e determinística sem conexão ao banco.
 *
 * Baseado em docs/db/notifications-audit.md + migration 20260523000001.
 *
 * Cenários cobertos:
 *   RLS-01  INSERT direto por autenticado → deve falhar (trigger guard)
 *   RLS-02  create_notification com recipient ≠ caller → deve falhar
 *   RLS-03  create_notification consigo mesmo, tipo válido → deve funcionar
 *   RLS-04  Rate limit por par: 11ª notificação → deve ser rejeitada
 *   RLS-05  Rate limit global: 51ª notificação do sender → deve ser rejeitada
 *   RLS-06  Payload inválido: título vazio → deve rejeitar
 *   RLS-07  Payload inválido: chave extra no payload → deve rejeitar
 *   RLS-08  Payload inválido: título acima de 160 chars → deve rejeitar
 *   RLS-09  Payload inválido: body acima de 1000 chars → deve rejeitar
 *   RLS-10  Tipo inválido: string fora do enum → deve rejeitar
 *   RLS-11  Recipient inativo → deve rejeitar
 *   RLS-12  SELECT: usuário A não enxerga notificações do usuário B
 *   RLS-13  SELECT: notificações soft-deleted ficam invisíveis
 *   RLS-14  UPDATE: usuário só atualiza read_at das próprias
 *   RLS-15  UPDATE: tentativa de alterar title → deve rejeitar
 *   RLS-16  UPDATE: read_at imutável após definido
 *   RLS-17  DELETE físico pelo usuário → deve falhar (trigger guard delete)
 *   RLS-18  notificar_barbeiro_chegada: p_title do caller é IGNORADO (V2 fix)
 *   RLS-19  notificar_barbeiro_chegada: cliente sem entry válida → rejeitar
 *   RLS-20  notificar_barbeiro_chegada: tipo inválido → rejeitar
 *   RLS-21  notificar_barbeiro_chegada: entry_id não é UUID → rejeitar
 *   RLS-22  Regression: fluxo legítimo completo de chegada do cliente
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const crypto          = require('node:crypto');

// ─── UUIDs fixos ──────────────────────────────────────────────────────────────

const PROF_ID   = 'aaaa0000-0000-4000-8000-000000000001';
const CLIENT_A  = 'bbbb0000-0000-4000-8000-000000000001';
const CLIENT_B  = 'cccc0000-0000-4000-8000-000000000002';
const ENTRY_ID  = 'dddd0000-0000-4000-8000-000000000001';

const VALID_TYPES = new Set([
  'sistema', 'agendamento', 'barbearia', 'engajamento',
  'appointment_confirmed', 'new_message', 'queue_update',
  'client_at_shop', 'client_arriving_late', 'client_not_seated',
  'client_absent', 'queue_next_client', 'queue_empty',
]);

// ─── Simulação: guard trigger (BEFORE INSERT) ─────────────────────────────────

/**
 * Espelha public.notifications_guard_insert():
 * permite INSERT apenas se allowedByFunction=true ou role='service_role'.
 */
function guardTriggerInsert({ allowedByFunction = false, role = 'authenticated' } = {}) {
  if (allowedByFunction || role === 'service_role') return true;
  const err = new Error('notification_direct_insert_forbidden');
  err.code  = '42501';
  throw err;
}

// ─── Simulação: guard trigger (BEFORE UPDATE) ─────────────────────────────────

/**
 * Espelha public.notifications_guard_user_update().
 * Retorna o newRow modificado (is_read sincronizado) ou lança erro.
 */
function guardTriggerUpdate({ role = 'authenticated', oldRow, newRow }) {
  if (role !== 'authenticated') return { ...newRow };

  const protectedFields = ['user_id', 'type', 'title', 'body', 'data', 'created_at'];
  for (const f of protectedFields) {
    if (JSON.stringify(oldRow[f]) !== JSON.stringify(newRow[f])) {
      throw Object.assign(new Error('notification_update_fields_forbidden'), { code: 'P0001' });
    }
  }

  if (oldRow.read_at !== null && newRow.read_at !== oldRow.read_at) {
    throw Object.assign(new Error('notification_read_at_immutable'), { code: 'P0001' });
  }

  if (oldRow.deleted_at !== null && newRow.deleted_at !== oldRow.deleted_at) {
    throw Object.assign(new Error('notification_deleted_at_immutable'), { code: 'P0001' });
  }

  return { ...newRow, is_read: newRow.read_at !== null };
}

// ─── Simulação: guard trigger (BEFORE DELETE) ─────────────────────────────────

function guardTriggerDelete({ role = 'authenticated' } = {}) {
  if (role === 'authenticated') {
    throw Object.assign(
      new Error('notification_delete_forbidden_use_deleted_at'),
      { code: 'P0001' },
    );
  }
  return true;
}

// ─── Simulação: RLS SELECT policy ─────────────────────────────────────────────

/** Espelha notifications_select_own: auth.uid() = user_id AND deleted_at IS NULL */
function selectPolicy({ callerUid, row }) {
  return row.user_id === callerUid && row.deleted_at === null;
}

// ─── Simulação: _insert_validated_notification ───────────────────────────────

/**
 * Espelha a lógica de validação de public._insert_validated_notification().
 * Não conecta ao banco — usa os mapas em memória passados como parâmetro.
 *
 * @param {object}  opts
 * @param {string}  opts.recipientId
 * @param {string|null} opts.senderId
 * @param {string}  opts.type
 * @param {object}  opts.payload        — { title, body?, data? }
 * @param {boolean} opts.applyRateLimit
 * @param {Map}     opts.profiles       — Map<uuid, { is_active: boolean }>
 * @param {Map}     opts.rateLimits     — Map<'sender:recipient', { count, windowStart }>
 * @param {Map}     opts.senderLimits   — Map<sender_uuid, { count, windowStart }>
 * @returns {{ id: string, recipientId: string, type: string, title: string, body: string }}
 */
function insertValidatedNotification(opts) {
  const { recipientId, senderId, type, payload, applyRateLimit,
          profiles, rateLimits, senderLimits } = opts;

  // Recipient: deve existir e estar ativo
  const profile = profiles.get(recipientId);
  if (!recipientId || !profile || !profile.is_active) {
    throw Object.assign(new Error('notification_recipient_invalid'), { code: 'P0001' });
  }

  // Type: deve ser membro do enum
  if (!VALID_TYPES.has(type)) {
    throw Object.assign(new Error('notification_invalid_type'), { code: 'P0001' });
  }

  // Payload: schema estrito
  if (!payload
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || !payload.title
      || typeof payload.title !== 'string'
      || payload.title.trim().length < 1
      || payload.title.trim().length > 160) {
    throw Object.assign(new Error('notification_invalid_payload'), { code: 'P0001' });
  }
  if (payload.body !== undefined
      && (typeof payload.body !== 'string' || payload.body.length > 1000)) {
    throw Object.assign(new Error('notification_invalid_payload'), { code: 'P0001' });
  }
  if (payload.data !== undefined
      && (typeof payload.data !== 'object' || Array.isArray(payload.data))) {
    throw Object.assign(new Error('notification_invalid_payload'), { code: 'P0001' });
  }
  const ALLOWED_KEYS = new Set(['title', 'body', 'data']);
  for (const k of Object.keys(payload)) {
    if (!ALLOWED_KEYS.has(k)) {
      throw Object.assign(new Error('notification_invalid_payload'), { code: 'P0001' });
    }
  }

  if (applyRateLimit) {
    if (!senderId) {
      throw Object.assign(new Error('notification_sender_invalid'), { code: 'P0001' });
    }

    // Rate limit global (50/min por sender)
    const gEntry = senderLimits.get(senderId) ?? { count: 0, windowStart: Date.now() };
    const gExpired = Date.now() - gEntry.windowStart >= 60_000;
    const gCount = gExpired ? 1 : gEntry.count + 1;
    senderLimits.set(senderId, {
      count: gCount,
      windowStart: gExpired ? Date.now() : gEntry.windowStart,
    });
    if (gCount > 50) {
      throw Object.assign(new Error('notification_global_rate_limited'), { code: 'P0001' });
    }

    // Rate limit por par (10/min por sender+recipient)
    const pKey   = `${senderId}:${recipientId}`;
    const pEntry = rateLimits.get(pKey) ?? { count: 0, windowStart: Date.now() };
    const pExpired = Date.now() - pEntry.windowStart >= 60_000;
    const pCount = pExpired ? 1 : pEntry.count + 1;
    rateLimits.set(pKey, {
      count: pCount,
      windowStart: pExpired ? Date.now() : pEntry.windowStart,
    });
    if (pCount > 10) {
      throw Object.assign(new Error('notification_rate_limited'), { code: 'P0001' });
    }
  }

  return {
    id:          crypto.randomUUID(),
    recipientId,
    type,
    title:       payload.title.trim(),
    body:        payload.body ?? '',
    data:        payload.data ?? {},
  };
}

// ─── Simulação: create_notification (ponto de entrada autenticado) ───────────

/**
 * Espelha public.create_notification():
 * authenticated só pode auto-notificar; service_role sem restrição.
 */
function createNotification({ callerUid, callerRole = 'authenticated', recipientId,
                              type, payload, profiles, rateLimits, senderLimits }) {
  if (callerRole === 'service_role') {
    return insertValidatedNotification({
      recipientId, senderId: null, type, payload,
      applyRateLimit: false, profiles, rateLimits, senderLimits,
    });
  }
  if (!callerUid) {
    throw Object.assign(new Error('notification_auth_required'), { code: 'P0001' });
  }
  if (recipientId !== callerUid) {
    throw Object.assign(new Error('notification_recipient_forbidden'), { code: 'P0001' });
  }
  return insertValidatedNotification({
    recipientId, senderId: callerUid, type, payload,
    applyRateLimit: true, profiles, rateLimits, senderLimits,
  });
}

// ─── Simulação: notificar_barbeiro_chegada (pós-fix V2/V4) ───────────────────

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/**
 * Espelha public.notificar_barbeiro_chegada() após migration 20260523000001.
 * p_title e p_body do caller são IGNORADOS.
 * Retorna o payload que seria inserido (title e body derivados do banco).
 */
function notificarBarbeiroChegada({ professionalId, type, pTitle, pBody, pData,
                                   callerUid, queueEntries, profiles,
                                   rateLimits, senderLimits }) {
  const VALID_ARRIVAL_TYPES = ['client_at_shop', 'client_arriving_late', 'client_not_seated'];

  if (!VALID_ARRIVAL_TYPES.includes(type)
      || !pData
      || typeof pData !== 'object'
      || !pData.entry_id
      || !UUID_REGEX.test(pData.entry_id)) {
    throw Object.assign(new Error('notification_queue_payload_invalid'), { code: 'P0001' });
  }

  const entry = queueEntries.find(
    e => e.id === pData.entry_id
      && e.client_id === callerUid
      && e.professional_id === professionalId,
  );

  if (!entry) {
    throw Object.assign(new Error('notification_queue_recipient_forbidden'), { code: 'P0001' });
  }

  const clientName = profiles.get(entry.client_id)?.full_name ?? 'Cliente';

  // p_title e p_body do caller IGNORADOS — conteúdo derivado de type + banco
  const TITLES = {
    client_at_shop:       'Cliente na barbearia',
    client_arriving_late: 'Cliente a caminho',
    client_not_seated:    'Cliente ainda nao esta pronto',
  };
  const BODIES = {
    client_at_shop:       `${clientName} confirmou que esta na barbearia.`,
    client_arriving_late: `${clientName} ainda nao chegou. Aguardando...`,
    client_not_seated:    `${clientName} avisou que ainda nao esta sentado.`,
  };

  const derivedTitle = TITLES[type];
  const derivedBody  = BODIES[type];

  return insertValidatedNotification({
    recipientId:     professionalId,
    senderId:        callerUid,
    type,
    payload:         { title: derivedTitle, body: derivedBody, data: pData },
    applyRateLimit:  true,
    profiles,
    rateLimits,
    senderLimits,
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function criarProfiles(overrides = {}) {
  return new Map([
    [PROF_ID,  { is_active: true, full_name: 'Barbeiro Silva', ...overrides[PROF_ID] }],
    [CLIENT_A, { is_active: true, full_name: 'Ana',            ...overrides[CLIENT_A] }],
    [CLIENT_B, { is_active: true, full_name: 'Bruno',          ...overrides[CLIENT_B] }],
  ]);
}

function criarQueueEntries() {
  return [
    { id: ENTRY_ID, client_id: CLIENT_A, professional_id: PROF_ID, barbershop_id: 'shop1' },
  ];
}

function criarRateLimits() {
  return { pair: new Map(), sender: new Map() };
}

function payloadValido(overrides = {}) {
  return { title: 'Novo agendamento', body: 'Seu horário foi confirmado.', ...overrides };
}

// ─── describe: guard trigger de INSERT ──────────────────────────────────────────

describe('RLS — guard trigger INSERT', () => {

  test('RLS-01 INSERT direto por autenticado → deve falhar com 42501', () => {
    assert.throws(
      () => guardTriggerInsert({ allowedByFunction: false, role: 'authenticated' }),
      (err) => {
        assert.equal(err.message, 'notification_direct_insert_forbidden');
        assert.equal(err.code, '42501');
        return true;
      },
    );
  });

  test('INSERT via função autorizada → deve passar', () => {
    assert.doesNotThrow(() => guardTriggerInsert({ allowedByFunction: true }));
  });

  test('INSERT por service_role → deve passar', () => {
    assert.doesNotThrow(() => guardTriggerInsert({ role: 'service_role' }));
  });
});

// ─── describe: guard trigger de DELETE ──────────────────────────────────────────

describe('RLS — guard trigger DELETE', () => {

  test('RLS-17 DELETE físico por authenticated → deve falhar', () => {
    assert.throws(
      () => guardTriggerDelete({ role: 'authenticated' }),
      (err) => {
        assert.equal(err.message, 'notification_delete_forbidden_use_deleted_at');
        return true;
      },
    );
  });

  test('DELETE por service_role → deve passar', () => {
    assert.doesNotThrow(() => guardTriggerDelete({ role: 'service_role' }));
  });
});

// ─── describe: RLS SELECT policy ─────────────────────────────────────────────────

describe('RLS — SELECT policy', () => {

  test('RLS-12 usuário A não enxerga notificações do usuário B', () => {
    const rowDeB = { user_id: CLIENT_B, deleted_at: null };
    assert.equal(selectPolicy({ callerUid: CLIENT_A, row: rowDeB }), false);
  });

  test('RLS-13 notificações com deleted_at ficam invisíveis ao próprio usuário', () => {
    const row = { user_id: CLIENT_A, deleted_at: new Date().toISOString() };
    assert.equal(selectPolicy({ callerUid: CLIENT_A, row }), false);
  });

  test('SELECT próprio não deletado → visível', () => {
    const row = { user_id: CLIENT_A, deleted_at: null };
    assert.equal(selectPolicy({ callerUid: CLIENT_A, row }), true);
  });
});

// ─── describe: guard trigger de UPDATE ──────────────────────────────────────────

describe('RLS — guard trigger UPDATE', () => {

  const base = {
    id: 'notif-1', user_id: CLIENT_A, type: 'agendamento',
    title: 'Título original', body: 'Corpo', data: {},
    is_read: false, read_at: null, deleted_at: null,
    created_at: '2026-05-23T10:00:00Z',
  };

  test('RLS-14 atualizar read_at das próprias notificações → deve funcionar', () => {
    const newRow = { ...base, read_at: '2026-05-23T11:00:00Z' };
    const result = guardTriggerUpdate({ role: 'authenticated', oldRow: base, newRow });
    assert.equal(result.is_read, true, 'is_read deve ser sincronizado com read_at');
    assert.equal(result.read_at, '2026-05-23T11:00:00Z');
  });

  test('RLS-15 tentativa de alterar title → deve rejeitar', () => {
    const newRow = { ...base, title: 'Título adulterado' };
    assert.throws(
      () => guardTriggerUpdate({ role: 'authenticated', oldRow: base, newRow }),
      (err) => {
        assert.equal(err.message, 'notification_update_fields_forbidden');
        return true;
      },
    );
  });

  test('RLS-16 read_at imutável após definido → deve rejeitar', () => {
    const oldLida = { ...base, read_at: '2026-05-23T10:00:00Z', is_read: true };
    const tentativa = { ...oldLida, read_at: '2026-05-23T12:00:00Z' };
    assert.throws(
      () => guardTriggerUpdate({ role: 'authenticated', oldRow: oldLida, newRow: tentativa }),
      (err) => {
        assert.equal(err.message, 'notification_read_at_immutable');
        return true;
      },
    );
  });

  test('soft-delete via deleted_at → deve funcionar', () => {
    const newRow = { ...base, deleted_at: '2026-05-23T11:00:00Z' };
    assert.doesNotThrow(() =>
      guardTriggerUpdate({ role: 'authenticated', oldRow: base, newRow }),
    );
  });

  test('service_role pode alterar qualquer campo sem restrição', () => {
    const newRow = { ...base, title: 'Novo título pelo service_role' };
    assert.doesNotThrow(() =>
      guardTriggerUpdate({ role: 'service_role', oldRow: base, newRow }),
    );
  });
});

// ─── describe: _insert_validated_notification / create_notification ─────────────

describe('RLS — validação de INSERT (_insert_validated_notification)', () => {

  test('RLS-03 create_notification consigo mesmo, tipo válido → deve funcionar', () => {
    const { pair, sender } = criarRateLimits();
    const result = createNotification({
      callerUid: CLIENT_A, recipientId: CLIENT_A,
      type: 'agendamento', payload: payloadValido(),
      profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
    });
    assert.equal(result.recipientId, CLIENT_A);
    assert.equal(result.type, 'agendamento');
    assert.ok(result.id, 'deve retornar id');
  });

  test('RLS-02 create_notification com recipient ≠ caller → deve falhar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => createNotification({
        callerUid: CLIENT_A, recipientId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_recipient_forbidden');
        return true;
      },
    );
  });

  test('RLS-11 recipient inativo → deve rejeitar', () => {
    const profiles = criarProfiles({ [CLIENT_A]: { is_active: false } });
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => createNotification({
        callerUid: CLIENT_A, recipientId: CLIENT_A,
        type: 'agendamento', payload: payloadValido(),
        profiles, rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_recipient_invalid');
        return true;
      },
    );
  });

  test('RLS-10 tipo inválido (string fora do enum) → deve rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'tipo_inventado', payload: payloadValido(),
        applyRateLimit: true,
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_invalid_type');
        return true;
      },
    );
  });

  test('RLS-06 payload inválido: título vazio → deve rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento', payload: { title: '   ' },
        applyRateLimit: true,
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_invalid_payload');
        return true;
      },
    );
  });

  test('RLS-07 payload inválido: chave extra → deve rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento',
        payload: { title: 'Ok', extra_field: 'injetado' },
        applyRateLimit: true,
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_invalid_payload');
        return true;
      },
    );
  });

  test('RLS-08 título acima de 160 chars → deve rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento',
        payload: { title: 'A'.repeat(161) },
        applyRateLimit: true,
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_invalid_payload');
        return true;
      },
    );
  });

  test('RLS-09 body acima de 1000 chars → deve rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento',
        payload: { title: 'Ok', body: 'B'.repeat(1001) },
        applyRateLimit: true,
        profiles: criarProfiles(), rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_invalid_payload');
        return true;
      },
    );
  });
});

// ─── describe: rate limiting ─────────────────────────────────────────────────────

describe('RLS — rate limiting', () => {

  test('RLS-04 rate limit por par: 11ª notificação → deve ser rejeitada', () => {
    const { pair, sender } = criarRateLimits();
    const profiles = criarProfiles();

    // 10 envios bem-sucedidos
    for (let i = 0; i < 10; i++) {
      insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      });
    }

    // 11º deve falhar
    assert.throws(
      () => insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_rate_limited');
        return true;
      },
    );
  });

  test('RLS-05 rate limit global: 51ª notificação do sender → deve ser rejeitada', () => {
    const pair   = new Map();
    const sender = new Map();
    const profiles = criarProfiles();

    // 50 envios para recipients diferentes — cada par tem apenas 1 envio
    for (let i = 0; i < 50; i++) {
      const recipientId = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000001`;
      profiles.set(recipientId, { is_active: true, full_name: `User ${i}` });
      insertValidatedNotification({
        recipientId, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      });
    }

    // 51º — recipient diferente (par nunca atingido), mas sender global estourado
    const recipientNovo = '99999999-0000-4000-8000-000000000001';
    profiles.set(recipientNovo, { is_active: true, full_name: 'Novo' });
    assert.throws(
      () => insertValidatedNotification({
        recipientId: recipientNovo, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_global_rate_limited');
        return true;
      },
    );
  });

  test('rate limit de par não afeta outro recipient do mesmo sender', () => {
    const { pair, sender } = criarRateLimits();
    const profiles = criarProfiles();

    // Esgota limite A→B
    for (let i = 0; i < 10; i++) {
      insertValidatedNotification({
        recipientId: CLIENT_A, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      });
    }

    // B→PROF_ID (par diferente) ainda funciona
    assert.doesNotThrow(() =>
      insertValidatedNotification({
        recipientId: PROF_ID, senderId: CLIENT_B,
        type: 'agendamento', payload: payloadValido(),
        applyRateLimit: true, profiles, rateLimits: pair, senderLimits: sender,
      }),
    );
  });
});

// ─── describe: notificar_barbeiro_chegada (V2/V4 fix) ────────────────────────────

describe('RLS — notificar_barbeiro_chegada (V2/V4 fix)', () => {

  test('RLS-18 p_title e p_body do caller são IGNORADOS; conteúdo vem do banco', () => {
    const { pair, sender } = criarRateLimits();
    const result = notificarBarbeiroChegada({
      professionalId: PROF_ID,
      type:   'client_at_shop',
      pTitle: 'URGENTE: acesse barberflow-fake.com',  // ataque de phishing
      pBody:  'Texto malicioso com 1000 chars...',
      pData:  { entry_id: ENTRY_ID },
      callerUid:   CLIENT_A,
      queueEntries: criarQueueEntries(),
      profiles:     criarProfiles(),
      rateLimits:   pair,
      senderLimits: sender,
    });

    // Conteúdo deve vir do banco, não do caller
    assert.equal(result.title, 'Cliente na barbearia',
      'título deve ser fixo por type, não do caller');
    assert.equal(result.body, 'Ana confirmou que esta na barbearia.',
      'corpo deve usar nome do banco, não p_body do caller');
  });

  test('RLS-22 regression: fluxo legítimo de chegada do cliente → funciona', () => {
    const { pair, sender } = criarRateLimits();
    const result = notificarBarbeiroChegada({
      professionalId: PROF_ID,
      type:   'client_arriving_late',
      pTitle: 'Qualquer coisa',
      pBody:  'Qualquer coisa',
      pData:  { entry_id: ENTRY_ID, barbershop_id: 'shop1' },
      callerUid:   CLIENT_A,
      queueEntries: criarQueueEntries(),
      profiles:     criarProfiles(),
      rateLimits:   pair,
      senderLimits: sender,
    });

    assert.equal(result.type, 'client_arriving_late');
    assert.equal(result.title, 'Cliente a caminho');
    assert.ok(result.body.startsWith('Ana '));
  });

  test('RLS-19 cliente sem entry válida para o profissional → rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    const outroProfId = 'ffff0000-0000-4000-8000-000000000001';
    assert.throws(
      () => notificarBarbeiroChegada({
        professionalId: outroProfId,  // profissional diferente do entry
        type: 'client_at_shop',
        pTitle: 'x', pBody: 'x',
        pData: { entry_id: ENTRY_ID },
        callerUid:   CLIENT_A,
        queueEntries: criarQueueEntries(),
        profiles:     criarProfiles(),
        rateLimits:   pair,
        senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_queue_recipient_forbidden');
        return true;
      },
    );
  });

  test('RLS-20 tipo inválido em notificar_barbeiro_chegada → rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => notificarBarbeiroChegada({
        professionalId: PROF_ID,
        type:   'queue_update',  // tipo válido no enum, mas não aceito por esta RPC
        pTitle: 'x', pBody: 'x',
        pData:  { entry_id: ENTRY_ID },
        callerUid:    CLIENT_A,
        queueEntries: criarQueueEntries(),
        profiles:     criarProfiles(),
        rateLimits:   pair,
        senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_queue_payload_invalid');
        return true;
      },
    );
  });

  test('RLS-21 entry_id não é UUID → rejeitar', () => {
    const { pair, sender } = criarRateLimits();
    assert.throws(
      () => notificarBarbeiroChegada({
        professionalId: PROF_ID,
        type:   'client_at_shop',
        pTitle: 'x', pBody: 'x',
        pData:  { entry_id: '../etc/passwd' },
        callerUid:    CLIENT_A,
        queueEntries: criarQueueEntries(),
        profiles:     criarProfiles(),
        rateLimits:   pair,
        senderLimits: sender,
      }),
      (err) => {
        assert.equal(err.message, 'notification_queue_payload_invalid');
        return true;
      },
    );
  });

  test('client_not_seated gera título e corpo corretos', () => {
    const { pair, sender } = criarRateLimits();
    const result = notificarBarbeiroChegada({
      professionalId: PROF_ID,
      type:   'client_not_seated',
      pTitle: 'ignorado', pBody: 'ignorado',
      pData:  { entry_id: ENTRY_ID },
      callerUid:    CLIENT_A,
      queueEntries: criarQueueEntries(),
      profiles:     criarProfiles(),
      rateLimits:   pair,
      senderLimits: sender,
    });

    assert.equal(result.title, 'Cliente ainda nao esta pronto');
    assert.ok(result.body.includes('Ana'));
  });
});
