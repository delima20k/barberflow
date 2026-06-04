'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseBroadcaster } = require('../infrastructure/realtime/SupabaseBroadcaster');

describe('SupabaseBroadcaster', () => {
  test('habilitado=false sem url/key/fetch', () => {
    assert.equal(new SupabaseBroadcaster({ url: '', serviceKey: '', fetchImpl: null }).habilitado, false);
    assert.equal(new SupabaseBroadcaster({ url: 'https://x.co', serviceKey: '', fetchImpl: () => {} }).habilitado, false);
    assert.equal(new SupabaseBroadcaster({ url: 'https://x.co', serviceKey: 'k', fetchImpl: null }).habilitado, false);
  });

  test('habilitado=true com url, key e fetch', () => {
    const b = new SupabaseBroadcaster({ url: 'https://x.supabase.co', serviceKey: 'svc', fetchImpl: () => {} });
    assert.equal(b.habilitado, true);
  });

  test('broadcast faz POST no endpoint correto com headers e body', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { status: 202 }; };
    const b = new SupabaseBroadcaster({ url: 'https://x.supabase.co/', serviceKey: 'svc-key', fetchImpl });

    const res = await b.broadcast({
      topic: 'chat.user-b',
      event: 'events.v1.chat.message_created',
      payload: { message: { id: 'm1' } },
      private: true,
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 202);
    assert.equal(calls[0].url, 'https://x.supabase.co/realtime/v1/api/broadcast');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers.apikey, 'svc-key');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer svc-key');
    const body = JSON.parse(calls[0].opts.body);
    assert.deepEqual(body, {
      messages: [{
        topic: 'chat.user-b',
        event: 'events.v1.chat.message_created',
        payload: { message: { id: 'm1' } },
        private: true,
      }],
    });
  });

  test('broadcast retorna skipped quando desabilitado', async () => {
    const b = new SupabaseBroadcaster({ url: '', serviceKey: '', fetchImpl: null });
    const res = await b.broadcast({ topic: 'chat.x', event: 'e', payload: {} });
    assert.equal(res.skipped, true);
    assert.equal(res.ok, false);
  });

  test('broadcast retorna skipped sem topic ou event', async () => {
    const b = new SupabaseBroadcaster({ url: 'https://x.co', serviceKey: 'k', fetchImpl: async () => ({ status: 202 }) });
    assert.equal((await b.broadcast({ event: 'e', payload: {} })).skipped, true);
    assert.equal((await b.broadcast({ topic: 't', payload: {} })).skipped, true);
  });

  test('broadcast captura erro de fetch sem lancar', async () => {
    const b = new SupabaseBroadcaster({
      url: 'https://x.co', serviceKey: 'k',
      fetchImpl: async () => { throw new Error('network down'); },
    });
    const res = await b.broadcast({ topic: 'chat.x', event: 'e', payload: {} });
    assert.equal(res.ok, false);
    assert.match(res.error, /network down/);
  });
});
