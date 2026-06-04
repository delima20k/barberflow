'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260604000002_chat_realtime_private_channels.sql');

describe('Chat realtime private channel policy', () => {
  test('autoriza usuario autenticado a assinar somente chat.{auth.uid}', () => {
    assert.ok(fs.existsSync(MIGRATION), 'migration de realtime privado do chat deve existir');
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /ON\s+realtime\.messages/i);
    assert.match(sql, /TO\s+authenticated/i);
    assert.match(sql, /realtime\.topic\(\)\s*=\s*'chat\.'\s*\|\|\s*auth\.uid\(\)::text/i);
  });
});
