'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');
const { Message } = require('../domain/chat/entities/Message');

const MESSAGE_ROW = {
  id:                       '11111111-1111-4111-8111-111111111111',
  conversation_id:          '22222222-2222-4222-8222-222222222222',
  sender_id:                '33333333-3333-4333-8333-333333333333',
  client_message_id:        'client-001',
  body:                     '',
  encrypted_payload:        { v: 1, alg: 'AES-GCM-256', iv: 'iv', ct: 'ct', kid: 'peer' },
  e2e_key_version:          null,
  created_at:               '2026-06-15T12:00:00.000Z',
  deleted_at:               null,
  retention_until:          null,
  chat_message_attachments: [],
};

class QueryStub {
  #result;
  #calls;

  constructor(result, calls) {
    this.#result = result;
    this.#calls = calls;
  }

  select() { this.#calls.select += 1; return this; }
  eq() { this.#calls.eq += 1; return this; }
  single() { return Promise.resolve(this.#result); }
  maybeSingle() { this.#calls.maybeSingle += 1; return Promise.resolve(this.#result); }
}

class ChatDbStub {
  calls = { from: [], upsert: 0, select: 0, eq: 0, maybeSingle: 0 };

  from(table) {
    this.calls.from.push(table);
    return {
      upsert: () => {
        this.calls.upsert += 1;
        return new QueryStub({ data: MESSAGE_ROW, error: null }, this.calls);
      },
      select: () => {
        this.calls.select += 1;
        return new QueryStub({ data: MESSAGE_ROW, error: null }, this.calls);
      },
    };
  }
}

describe('SupabaseChatRepository', () => {
  it('saveMessage reutiliza o retorno do upsert quando nao ha anexos', async () => {
    const db = new ChatDbStub();
    const repo = new SupabaseChatRepository(db);
    const message = Message.restore({
      id:               MESSAGE_ROW.id,
      conversationId:   MESSAGE_ROW.conversation_id,
      senderId:         MESSAGE_ROW.sender_id,
      clientMessageId:  MESSAGE_ROW.client_message_id,
      body:             MESSAGE_ROW.body,
      encryptedPayload: MESSAGE_ROW.encrypted_payload,
      createdAt:        MESSAGE_ROW.created_at,
      attachments:      [],
    });

    const saved = await repo.saveMessage(message);

    assert.deepEqual({
      id: saved.id,
      upsertCalls: db.calls.upsert,
      tables: db.calls.from,
      extraMessageLookup: db.calls.maybeSingle,
    }, {
      id: MESSAGE_ROW.id,
      upsertCalls: 1,
      tables: ['chat_messages'],
      extraMessageLookup: 0,
    });
  });

  it('mantem indice para rate limit por sender e janela recente', () => {
    const root = path.resolve(__dirname, '..', '..');
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260615000002_chat_send_rate_limit_index.sql'),
      'utf8',
    );

    assert.match(
      migration,
      /CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_recent\s+ON public\.chat_messages\(sender_id, created_at DESC, conversation_id\)/,
    );
  });
});
