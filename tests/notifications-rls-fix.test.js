'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260522000004_notifications_rls_security_fix.sql',
);
const ROLLBACK = path.join(ROOT, 'docs/db/notifications-fix-rollback.sql');
const RLS_SQL_TEST = path.join(ROOT, 'supabase/tests/notifications_rls_fix.sql');

function ler(relativeOrAbsolutePath) {
  return fs.readFileSync(relativeOrAbsolutePath, 'utf8');
}

describe('notifications RLS hardening', () => {
  it('fecha INSERT/DELETE direto e restringe SELECT/UPDATE das notifications legadas', () => {
    const sql = ler(MIGRATION);

    assert.match(sql, /DROP POLICY IF EXISTS "notifications_insert_service"/i);
    assert.match(sql, /DROP POLICY IF EXISTS "notifications_insert_own"/i);
    assert.match(sql, /CREATE POLICY "notifications_select_own"/i);
    assert.match(sql, /deleted_at IS NULL/i);
    assert.match(sql, /CREATE POLICY "notifications_update_read_own"/i);
    assert.match(sql, /CREATE TRIGGER trg_notifications_guard_insert/i);
    assert.match(sql, /CREATE TRIGGER trg_notifications_guard_user_update/i);
    assert.match(sql, /CREATE TRIGGER trg_notifications_guard_user_delete/i);
    assert.doesNotMatch(sql, /CREATE POLICY\s+"notifications_insert[^"]*"\s+ON public\.notifications/i);
    assert.doesNotMatch(sql, /CREATE POLICY\s+"notifications_delete[^"]*"\s+ON public\.notifications/i);
  });

  it('cria function segura com allowlist, schema de payload, rate limit e auditoria', () => {
    const sql = ler(MIGRATION);

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_notification\(/i);
    assert.match(sql, /SECURITY DEFINER/i);
    assert.match(sql, /notification_type/i);
    assert.match(sql, /notification_rate_limits/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /notification_audit/i);
    assert.match(sql, /notification_invalid_payload/i);
    assert.match(sql, /notification_recipient_forbidden/i);
  });

  it('mantem testes SQL de staging para os vetores pedidos e rollback documentado', () => {
    const sqlTest = ler(RLS_SQL_TEST);
    const rollback = ler(ROLLBACK);

    assert.match(sqlTest, /INSERT INTO public\.notifications/i);
    assert.match(sqlTest, /notification_recipient_forbidden/i);
    assert.match(sqlTest, /rate limit/i);
    assert.match(sqlTest, /notification_invalid_payload/i);
    assert.match(sqlTest, /notification_invalid_type/i);
    assert.match(sqlTest, /read_at/i);
    assert.match(rollback, /Rollback de seguranca para notifications/i);
    assert.match(rollback, /DROP FUNCTION IF EXISTS public\.create_notification/i);
  });

  it('troca marcacao direta de is_read por read_at no codigo cliente e backend', () => {
    const notificationService = ler(path.join(ROOT, 'shared/js/NotificationService.js'));
    const comunicacaoRepo = ler(path.join(ROOT, 'src/repositories/ComunicacaoRepository.js'));
    const diagnostics = ler(path.join(ROOT, 'shared/js/SupabaseService.js'));

    assert.match(notificationService, /\.update\(\{ read_at:/);
    assert.doesNotMatch(notificationService, /\.update\(\{ is_read: true \}/);
    assert.match(comunicacaoRepo, /\.update\(\{ read_at:/);
    assert.doesNotMatch(diagnostics, /INSERT notifications[\s\S]*POST \/notifications:/);
    assert.match(diagnostics, /rpc\/create_notification/);
  });
});
