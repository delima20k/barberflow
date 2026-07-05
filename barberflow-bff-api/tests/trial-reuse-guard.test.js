'use strict';

// =============================================================
// trial-reuse-guard.test.js — Blindagem financeira contra reuso de trial.
//
// Cobre a camada de REPOSITÓRIO (onde vive o guard antes de expirar a
// assinatura + o backstop atômico 23505) e a existência da proteção no
// BANCO (migration com coluna trial_used_at, backfill e trigger).
//
// A camada de SERVICE é coberta em professional-payments.test.js.
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const ProfessionalPaymentRepository = require('../repositories/ProfessionalPaymentRepository');

const USER_ID = '11111111-1111-4111-8111-111111111111';

// ── Fake mínimo do query builder do supabase-js ──────────────────────────────
// Encadeamento suportado:
//   .from(t).select(c).eq().maybeSingle()               -> { data, error }
//   .from(t).update(p).eq().in()  (awaited direto)      -> { error }
//   .from(t).insert(p).select(c).single()               -> { data, error }
class FakeQuery {
  constructor(table, resolver, log) {
    this._table = table;
    this._resolver = resolver;
    this._log = log;
    this._op = null;
    this._payload = null;
  }
  select(_cols) { if (!this._op) this._op = 'select'; return this; }
  insert(payload) { this._op = 'insert'; this._payload = payload; return this; }
  update(payload) { this._op = 'update'; this._payload = payload; return this; }
  eq() { return this; }
  in() { return this; }
  maybeSingle() { return this._settle(); }
  single() { return this._settle(); }
  then(onFulfilled, onRejected) { return this._settle().then(onFulfilled, onRejected); }
  _settle() {
    this._log.push({ table: this._table, op: this._op, payload: this._payload });
    return Promise.resolve(this._resolver(this._table, this._op) ?? { data: null, error: null });
  }
}

function fakeDb(resolver) {
  const log = [];
  const db = { from: (table) => new FakeQuery(table, resolver, log) };
  return { db, log };
}

// ─── Repositório: jaUsouTrial ────────────────────────────────────────────────

describe('ProfessionalPaymentRepository — jaUsouTrial', () => {
  test('true quando profiles.trial_used_at está preenchido', async () => {
    const { db } = fakeDb((table, op) =>
      table === 'profiles' && op === 'select'
        ? { data: { trial_used_at: '2026-06-01T00:00:00.000Z' }, error: null }
        : { data: null, error: null });
    const repo = new ProfessionalPaymentRepository(db);
    assert.equal(await repo.jaUsouTrial(USER_ID), true);
  });

  test('false quando trial_used_at é null (nunca usou)', async () => {
    const { db } = fakeDb((table, op) =>
      table === 'profiles' && op === 'select'
        ? { data: { trial_used_at: null }, error: null }
        : { data: null, error: null });
    const repo = new ProfessionalPaymentRepository(db);
    assert.equal(await repo.jaUsouTrial(USER_ID), false);
  });
});

// ─── Repositório: getProfile expõe trial_used_at ─────────────────────────────

describe('ProfessionalPaymentRepository — getProfile inclui trial_used_at', () => {
  test('retorna trial_used_at do perfil', async () => {
    const { db } = fakeDb((table, op) =>
      table === 'profiles' && op === 'select'
        ? {
            data: {
              id: USER_ID,
              full_name: 'Prof',
              phone: null,
              role: 'professional',
              pro_type: 'barbeiro',
              is_active: true,
              cpf_cnpj_enc: null,
              trial_used_at: '2026-05-10T00:00:00.000Z',
            },
            error: null,
          }
        : { data: null, error: null });
    const repo = new ProfessionalPaymentRepository(db);
    const profile = await repo.getProfile(USER_ID);
    assert.equal(profile.trial_used_at, '2026-05-10T00:00:00.000Z');
  });
});

// ─── Repositório: ativarTrial ────────────────────────────────────────────────

describe('ProfessionalPaymentRepository — ativarTrial (guard + backstop)', () => {
  test('recusa ANTES de expirar quando o usuário já usou trial', async () => {
    const { db, log } = fakeDb((table, op) => {
      if (table === 'profiles' && op === 'select') {
        return { data: { trial_used_at: '2026-06-01T00:00:00.000Z' }, error: null };
      }
      return { data: null, error: null };
    });
    const repo = new ProfessionalPaymentRepository(db);

    await assert.rejects(
      () => repo.ativarTrial(USER_ID),
      err => err.status === 409 && err.message === 'trial_already_used',
    );

    // Nenhum UPDATE de expiração nem INSERT pode ter ocorrido.
    assert.equal(log.some(e => e.table === 'subscriptions' && e.op === 'update'), false,
      'não pode expirar assinatura vigente quando o trial já foi usado');
    assert.equal(log.some(e => e.table === 'subscriptions' && e.op === 'insert'), false,
      'não pode inserir novo trial quando o trial já foi usado');
  });

  test('backstop atômico: erro 23505 do banco vira 409 trial_already_used', async () => {
    const { db } = fakeDb((table, op) => {
      if (table === 'profiles' && op === 'select') {
        return { data: { trial_used_at: null }, error: null };   // passou pelo guard
      }
      if (table === 'subscriptions' && op === 'update') return { error: null };
      if (table === 'subscriptions' && op === 'insert') {
        return { data: null, error: { code: '23505', message: 'trial_already_used' } };
      }
      return { data: null, error: null };
    });
    const repo = new ProfessionalPaymentRepository(db);

    await assert.rejects(
      () => repo.ativarTrial(USER_ID),
      err => err.status === 409 && err.message === 'trial_already_used',
    );
  });

  test('sucesso quando nunca usou e o insert é aceito', async () => {
    const { db } = fakeDb((table, op) => {
      if (table === 'profiles' && op === 'select') return { data: { trial_used_at: null }, error: null };
      if (table === 'subscriptions' && op === 'update') return { error: null };
      if (table === 'subscriptions' && op === 'insert') {
        return {
          data: {
            id: '55555555-5555-4555-8555-555555555555',
            user_id: USER_ID,
            plan_type: 'trial',
            status: 'trial',
            starts_at: '2026-07-04T00:00:00.000Z',
            ends_at: '2026-07-11T00:00:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const repo = new ProfessionalPaymentRepository(db);
    const sub = await repo.ativarTrial(USER_ID);
    assert.equal(sub.plan_type, 'trial');
    assert.equal(sub.status, 'trial');
  });
});

// ─── Banco: a migration precisa existir com a proteção ───────────────────────

describe('Migration 20260704000001_prevent_trial_reuse — proteção no banco', () => {
  const SQL = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/migrations/20260704000001_prevent_trial_reuse.sql'),
    'utf8',
  );

  test('adiciona coluna trial_used_at em profiles', () => {
    assert.match(SQL, /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS trial_used_at timestamptz/i);
  });

  test('faz backfill não-destrutivo a partir do trial mais antigo', () => {
    assert.match(SQL, /UPDATE public\.profiles/i);
    assert.match(SQL, /MIN\(created_at\)/i);
    assert.match(SQL, /plan_type = 'trial'/i);
    // não pode conter DELETE (proteção anti-destrutiva)
    assert.doesNotMatch(SQL, /\bDELETE\b/i, 'a migration não pode apagar dados');
  });

  test('cria o trigger BEFORE INSERT enforce_single_trial', () => {
    assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.enforce_single_trial/i);
    assert.match(SQL, /BEFORE INSERT ON public\.subscriptions/i);
    assert.match(SQL, /RAISE EXCEPTION 'trial_already_used'/i);
    assert.match(SQL, /ERRCODE\s*=\s*'unique_violation'/i);
  });

  test('não emite DDL sobre o índice idx_subscriptions_one_active_per_user', () => {
    // Pode citá-lo em comentário, mas não pode CREATE/DROP/ALTER nele.
    assert.doesNotMatch(
      SQL,
      /\b(?:CREATE|DROP|ALTER)\b[^;]*\bidx_subscriptions_one_active_per_user\b/i,
      'a migration não deve mexer no índice de assinatura ativa existente',
    );
  });

  test('documenta rollback reversível', () => {
    assert.match(SQL, /DROP TRIGGER IF EXISTS trg_enforce_single_trial/i);
    assert.match(SQL, /DROP FUNCTION IF EXISTS public\.enforce_single_trial/i);
    assert.match(SQL, /DROP COLUMN IF EXISTS trial_used_at/i);
  });
});
